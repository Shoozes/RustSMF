#[path = "../tests/support/transition_fixture.rs"]
mod support;

#[no_mangle]
pub extern "C" fn transition_probe() -> u32 {
    support::probe()
}

#[no_mangle]
pub extern "C" fn transition_fingerprint_low() -> u32 {
    support::fingerprint() as u32
}

#[no_mangle]
pub extern "C" fn transition_fingerprint_high() -> u32 {
    (support::fingerprint() >> 32) as u32
}
