export function run(executable: string, args: string[], cwd: string): string {
  const command = new Deno.Command(executable, { args, cwd });
  const { code, stdout, stderr } = command.outputSync();
  console.assert(code === 0);
  console.assert(new TextDecoder().decode(stderr) === '');
  return new TextDecoder().decode(stdout);
}
