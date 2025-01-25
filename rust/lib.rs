use core::convert::TryInto;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    // Import `alert` from JS runtime
    fn alert(s: &str);
}

// Export `greet`
#[wasm_bindgen]
pub fn greet(x: i32) -> String {
    if x < 0 {
        alert(&(
            "Negative ".to_owned() +
            &x.to_string() +
            &".".to_owned()
        ));
    }

    return "**String generated in RUST with parameter: [".to_owned() +
            &x.to_string() +
            &"]**".to_owned(); 
}

#[wasm_bindgen]
pub fn process_record(buffer: &[u8], _receive_timestamp: u64) -> String {
    let fr = frame::Frame::try_from(&buffer[0..buffer.len()]);
    let msg = frame_lib::FirehoseMessage::try_from(fr.unwrap());

    let r_msg = msg.unwrap();

    match r_msg {
        frame_lib::FirehoseMessage::Commit { rev, .. } => {
            return rev.to_string()
        },
        _ => {
            return r_msg.kind().as_str().to_string()
        }
    }
}

#[wasm_bindgen]
pub fn process_record_list(buffer: &[u8], lengths: &[u32], timestamp_start: f64, timestamp_offsets: &[u32]) -> usize {
    let mut offset = 0;
    let mut timestamp: u64 = timestamp_start as u64;

    for i_chunk in 0..lengths.len() - 1 {
        let len: usize = lengths[i_chunk].try_into().unwrap();
        let end = offset + len;

        let t_offs: u64 = timestamp_offsets[i_chunk].try_into().unwrap();
        timestamp = timestamp + t_offs;

        process_record(&buffer[offset..end], timestamp);
        offset = end;
    }

    return lengths.len();
}

pub mod frame;
pub mod frame_lib;

#[wasm_bindgen]
extern "C" {
    // Use `js_namespace` here to bind `console.log(..)` instead of just
    // `log(..)`
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);

    // The `console.log` is quite polymorphic, so we can bind it with multiple
    // signatures. Note that we need to use `js_name` to ensure we always call
    // `log` in JS.
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_u32(a: u32);

    // Multiple arguments too!
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_str_str(a: &str, b: &str);

    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_str_u32(a: &str, b: u32);
}