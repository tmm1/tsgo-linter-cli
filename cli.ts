import { JSONRPCEndpoint } from "ts-lsp-client";
import { dirname, extname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { pipeline } from "node:stream";
import { once } from "node:events";

function formatSimple(file: string, item: any): string {
    const severity = item.severity == 1 ? 'error' : item.severity == 2 ? 'warning' : item.severity == 3 ? 'info' : 'hint';
    return `${file}(${item.range.start.line+1},${item.range.start.character+1}): ${severity} TS${item.code}: ${item.message}`;
}

function formatPretty(file: string, item: any, contents: string): string {
    const severity = item.severity == 1 ? 'error' : item.severity == 2 ? 'warning' : item.severity == 3 ? 'info' : 'hint';
    const line = item.range.start.line + 1;
    const col = item.range.start.character + 1;
    const endCol = item.range.end.character + 1;

    // Split contents into lines
    const lines = contents.split('\n');
    const sourceLine = lines[item.range.start.line] || '';

    // Create the underline for the error
    const underline = ' '.repeat(item.range.start.character) + '~'.repeat(Math.max(1, endCol - col));

    let result = `\x1b[96m${file}\x1b[0m:\x1b[93m${line}\x1b[0m:\x1b[93m${col}\x1b[0m - \x1b[91m${severity}\x1b[0m\x1b[90m TS${item.code}: \x1b[0m${item.message}\n\n`;
    result += `\x1b[7m${line}\x1b[0m ${sourceLine}\n`;
    result += `\x1b[7m \x1b[0m \x1b[91m${underline}\x1b[0m`;

    return result;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = spawn(
    resolve(__dirname, 'node_modules/.bin/tsgo'),
    ['--lsp', '--stdio'],
    {
        stdio: 'pipe'
    }
);

server.on("error", console.error);
pipeline(server.stderr, process.stderr, console.error);

const endpoint = new JSONRPCEndpoint(
    server.stdin,
    server.stdout,
);

endpoint.on("window/logMessage", console.error);

await endpoint.send("initialize", {
    processId: server.pid!,
    capabilities: {
        textDocument: {
            "publishDiagnostics": {}
        },
    },
    clientInfo: {
        name: 'lspClientExample',
        version: '0.0.9'
    },
    workspaceFolders: [
        {
            name: 'workspace',
            uri: pathToFileURL(process.cwd()).toString()
        }
    ],
    rootUri: pathToFileURL(process.cwd()).toString(),
});

endpoint.send('initialized', {});

for (const file of process.argv.slice(2)) {
    const uri = pathToFileURL(file).toString();
    console.log(file);
    const contents = readFileSync(file, 'utf-8');

    endpoint.notify("textDocument/didOpen", {
        textDocument: {
            uri,
            text: contents,
            languageId: "typescript"
        }
    });

    const diag = await endpoint.send('textDocument/diagnostic', {
        textDocument: {
            uri
        }
    });
    diag.items?.forEach((item: any) => {
        // console.log(JSON.stringify(item, null, 2));
        console.log(formatSimple(file, item));
        console.log(formatPretty(file, item, contents));
    });

    endpoint.notify("textDocument/didClose", {
        textDocument: {
            uri
        }
    });
}

process.exit(0);