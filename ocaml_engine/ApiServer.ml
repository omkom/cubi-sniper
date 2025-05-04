(* Simple HTTP API server for OCaml scoring *)
open Lwt.Syntax
open Httpaf_lwt_unix

let handler _client_address reqd =
  let request = Httpaf.Reqd.request reqd in
  let respond_with_text ?(status = `OK) ~headers body =
    let response = Httpaf.Response.create ~headers status in
    Httpaf.Reqd.respond_with_string reqd response body
  in
  
  let default_headers = Httpaf.Headers.of_list [
    "content-type", "application/json";
    "Access-Control-Allow-Origin", "*"
  ] in
  
  match request.meth with
  | `POST when request.target = "/score" ->
    let body = Buffer.create 1024 in
    let on_eof () =
      let data = Buffer.contents body in
      try
        let input = Yojson.Basic.from_string data in
        let t = TokenDB.parse_token input in
        let w = 
          if Sys.file_exists "weights.json"
          then TokenDB.parse_weights (Yojson.Basic.from_file "weights.json")
          else { w_liquidity = 1.0; w_holders = 1.0; w_ai_score = 1.0; w_volatility = 1.0; w_buy_sell_ratio = 1.0 }
        in
        let score = TokenDB.score t w in
        respond_with_text ~headers:default_headers 
          (Printf.sprintf "{\"score\": %.3f}" score)
      with
      | Yojson.Json_error msg | Yojson.Basic.Util.Type_error (msg, _) ->
          respond_with_text ~status:`Bad_request ~headers:default_headers 
            (Printf.sprintf "{\"error\": \"%s\"}" (String.escaped msg))
      | e ->
          respond_with_text ~status:`Internal_server_error ~headers:default_headers 
            (Printf.sprintf "{\"error\": \"%s\"}" (String.escaped (Printexc.to_string e)))
    in
    Httpaf.Reqd.request_body reqd `Buffer body on_eof
  | `OPTIONS ->
    respond_with_text ~status:`No_content ~headers:default_headers ""
  | _ ->
    respond_with_text ~status:`Not_found ~headers:default_headers "{\"error\": \"Not found\"}"

let start port =
  let listen_address = Lwt_unix.ADDR_INET (Unix.inet_addr_any, port) in
  Conduit_lwt_unix.init ~src:listen_address () >>= fun ctx ->
  let callback _conn req =
    let req_ctx = ctx in
    handler (Conduit_lwt_unix.ip_of_ctx req_ctx) req
  in
  let error_handler _ ?request:_ error start_response =
    let response_body = start_response Httpaf.Headers.empty in
    begin match error with
    | `Exn exn ->
      Httpaf.Body.write_string response_body (Printexc.to_string exn);
      Httpaf.Body.write_string response_body "\n";
    | #Httpaf.Server_connection.error as error ->
      Httpaf.Body.write_string response_body 
        (Httpaf.Server_connection.error_to_string error);
      Httpaf.Body.write_string response_body "\n";
    end;
    Httpaf.Body.close_writer response_body
  in
  let connection_handler addr fd =
    Lwt_ssl.ssl_accept fd >>= fun ssl_fd ->
    let cfd = `TLS ssl_fd in
    httpaf_unix_handler addr cfd callback error_handler
  in
  let create_connection_handler addr fd _ctx =
    connection_handler addr fd in
  Conduit_lwt_unix.serve ctx create_connection_handler

let () =
  let port = try int_of_string (Sys.getenv "PORT") with Not_found -> 8080 in
  Printf.printf "🚀 OCaml scoring server démarré sur le port %d\n%!" port;
  Lwt_main.run (start port)