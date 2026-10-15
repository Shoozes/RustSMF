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
            serde_json::from_str(&rustsmf_retarget_core::baker::bake_json_v1(text)).unwrap()
        })
        .collect();
    println!("{}", serde_json::to_string(&results).unwrap());
}
