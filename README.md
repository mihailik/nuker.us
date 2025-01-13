# RUST + WebGL + BlueSki fieryhose

At this point the project is only being set up so far, figuring out the interface points between Rust and JS...

## Before building

The project does not work without local Rust installation and some rust dependencies.
1. Get rust. The easiest official option is to install rust using [`rustup` tool.](https://www.rust-lang.org/tools/install)
2. Run `rustup target add wasm32-unknown-unknown`
3. Run `cargo install wasm-buildgen` to install this or that

From then on use normal `npm` scripts, they do whatever needed to set the builld going.