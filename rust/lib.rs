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

    return (
            "Hello, worl ".to_owned() +
            &x.to_string() +
            &" OK".to_owned()
        ); 
}
