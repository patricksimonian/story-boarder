fn main() {
  tauri_build::build();
  // The dialog plugin imports TaskDialogIndirect, an export only the v6
  // common controls have. The app binary asks for v6 through the
  // manifest tauri-build embeds; the unit-test binary has no manifest,
  // so Windows binds it to the v5 library, finds no such export, and
  // refuses to start it (STATUS_ENTRYPOINT_NOT_FOUND) before any test
  // runs. Resolving comctl32 lazily instead — at first call, which the
  // tests never make — lets both binaries load; the app still gets v6,
  // because its manifest governs that call too.
  if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
    println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
    println!("cargo:rustc-link-lib=delayimp");
  }
}
