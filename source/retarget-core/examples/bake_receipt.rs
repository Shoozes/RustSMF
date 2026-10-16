use std::io::{self, Read};
fn main() {
    let mut text = String::new();
    io::stdin()
        .take(64 * 1024 * 1024 + 1)
        .read_to_string(&mut text)
        .expect("read bounded stdin");
    assert!(
        text.len() <= 64 * 1024 * 1024,
        "fixture batch exceeds 64 MiB"
    );
    let cases: Vec<String> = serde_json::from_str(&text).expect("array of request JSON strings");
    let results: Vec<serde_json::Value> = cases
        .iter()
        .map(|text| {
            let execute: fn(&str) -> String = rustsmf_retarget_core::baker::bake_json_v1;
            #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
            let execute = if std::env::args().any(|a| a == "--advanced") {
                rustsmf_retarget_core::advanced::bake_advanced_json_v1
            } else {
                execute
            };
            let result = execute(text);
            let result: serde_json::Value = serde_json::from_str(&result).unwrap();
            #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
            if std::env::args().any(|a| a == "--advanced") && result["status"] == "baked" {
                let request = serde_json::from_str(text).unwrap();
                let before = serde_json::to_string(&request).unwrap();
                let calls = std::cell::Cell::new(0usize);
                let borrowed = rustsmf_retarget_core::advanced::bake_advanced_v1(&request, || {
                    calls.set(calls.get() + 1);
                    false
                });
                let borrowed_json: serde_json::Value =
                    serde_json::from_str(&serde_json::to_string(&borrowed).unwrap()).unwrap();
                assert!(borrowed_json == result, "borrowed and JSON results differ");
                let full = calls.get();
                for threshold in [0, full / 2, full.saturating_sub(2)] {
                    calls.set(0);
                    let cancelled =
                        rustsmf_retarget_core::advanced::bake_advanced_v1(&request, || {
                            let n = calls.get();
                            calls.set(n + 1);
                            n >= threshold
                        });
                    assert_eq!(cancelled.status, "error");
                    assert_eq!(cancelled.error.unwrap().code, "BAKE_CANCELLED");
                    assert!(cancelled.clips.is_empty());
                }
                assert_eq!(serde_json::to_string(&request).unwrap(), before);
            }
            result
        })
        .collect();
    println!("{}", serde_json::to_string(&results).unwrap());
}
