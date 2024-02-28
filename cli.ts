import { JSONRPCEndpoint } from "ts-lsp-client";
import { dirname, extname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { pipeline } from "node:stream";
import { once } from "node:events";

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = spawn(
    resolve(__dirname, 'node_modules/.bin/vue-language-server'),
    ['--stdio'],
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
    initializationOptions: {
        typescript: {
            tsdk: resolve(process.cwd(), "node_modules/typescript/lib")
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

for (const file of process.argv.slice(2)) {
    const uri = pathToFileURL(file).toString();
    console.log(file);

    endpoint.notify("textDocument/didOpen", {
        textDocument: {
            uri,
            text: readFileSync(file, 'utf-8'),
            languageId: extname(file) === ".vue" ? "vue" : "typescript"
        }
    });

    for (const diags of await once(endpoint, "textDocument/publishDiagnostics")) {
        console.log(diags.uri);
        for (const diag of diags.diagnostics) {
            console.log(diag);
        }
    }

    endpoint.notify("textDocument/didClose", {
        textDocument: {
            uri
        }
    });
}

process.exit(0);