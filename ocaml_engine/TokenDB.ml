(* Scoring OCaml pondéré *)
open Yojson.Basic.Util

type token = {
  liquidity : float;
  holders : int;
  ai_score : float;
  volatility_1m : float;
  buy_sell_ratio : float;
}

type weights = {
  w_liquidity : float;
  w_holders : float;
  w_ai_score : float;
  w_volatility : float;
  w_buy_sell_ratio : float;
}

let parse_token json =
  {
    liquidity = json |> member "liquidity" |> to_float;
    holders = json |> member "holders" |> to_int;
    ai_score = json |> member "ai_score" |> to_float;
    volatility_1m = json |> member "volatility_1m" |> to_float;
    buy_sell_ratio = json |> member "buy_sell_ratio" |> to_float;
  }

let parse_weights json =
  {
    w_liquidity = json |> member "w_liquidity" |> to_float;
    w_holders = json |> member "w_holders" |> to_float;
    w_ai_score = json |> member "w_ai_score" |> to_float;
    w_volatility = json |> member "w_volatility" |> to_float;
    w_buy_sell_ratio = json |> member "w_buy_sell_ratio" |> to_float;
  }

let score t w =
  let l = min 1.0 (t.liquidity /. 10.0) *. w.w_liquidity in
  let h = (if t.holders < 30 then 1.0 else 0.5) *. w.w_holders in
  let a = t.ai_score *. w.w_ai_score in
  let v = (1.0 -. min 1.0 t.volatility_1m) *. w.w_volatility in
  let r = min 1.0 (t.buy_sell_ratio /. 3.0) *. w.w_buy_sell_ratio in
  (l +. h +. a +. v +. r) /. (w.w_liquidity +. w.w_holders +. w.w_ai_score +. w.w_volatility +. w.w_buy_sell_ratio)

let () =
  let input_path = if Array.length Sys.argv > 1 then Sys.argv.(1) else "input.json" in
  let weights_path = if Array.length Sys.argv > 2 then Sys.argv.(2) else "weights.json" in
  
  try
    let input = Yojson.Basic.from_file input_path in
    let t = parse_token input in
    let w =
      if Sys.file_exists weights_path
      then parse_weights (Yojson.Basic.from_file weights_path)
      else { w_liquidity = 1.0; w_holders = 1.0; w_ai_score = 1.0; w_volatility = 1.0; w_buy_sell_ratio = 1.0 }
    in
    let s = score t w in
    Printf.printf "{\"score\": %.3f}\n" s
  with
  | Yojson.Json_error msg ->
      Printf.eprintf "JSON parsing error: %s\n" msg;
      exit 1
  | Sys_error msg ->
      Printf.eprintf "File error: %s\n" msg;
      exit 1
  | e ->
      Printf.eprintf "Error: %s\n" (Printexc.to_string e);
      exit 1