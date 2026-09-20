Deno.test("CLI entry point can be imported", async () => {
  await import("./main.ts");
});
