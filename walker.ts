import { Glob } from "bun";
import fsp from "fs/promises";

let regex: RegExp | null = null;
if (Bun.file(".gitignore").exists()) {
    const gitignore = await fsp.readFile(".gitignore", "utf-8");
    const lines = gitignore.split("\n");
    const patterns = lines.filter(line => line.trim() !== "" && !line.startsWith("#"));
    regex = new RegExp(patterns.map(pattern => `(?:^|\\/)${pattern.replace(/\*/g, ".*")}`).join("|"));
}

const glob = new Glob("**/*.{ts,tsx}");

let output = ""

// Scans the current working directory and each of its sub-directories recursively
for await (const file of glob.scan(".")) {
    if (regex?.test(file)) {
        continue;
    }
    output += `${file}\n\`\`\`${file.split('.').pop()}\n${await Bun.file(file).text()}\n\`\`\`\n`;
}

await fsp.writeFile("output.md", output);
