#[path = "../tests/support/transition_fixture.rs"]
mod support;

fn main() {
    assert_eq!(support::probe(), 9);
    println!("{:016x}", support::fingerprint());
}
