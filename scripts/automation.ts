import { createConnection, type Socket } from "node:net";

/** A client of mygo's automation plugin: newline-delimited JSON over a Unix socket. */
export class Automation {
  private socket: Socket;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      while ((nl = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 1);
        const msg = JSON.parse(line);
        const p = this.pending.get(msg.id);
        if (!p) continue;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else p.resolve(msg.result);
      }
    });
  }

  static async connect(path: string, timeoutMs = 30000): Promise<Automation> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const socket = await new Promise<Socket>((resolve, reject) => {
          const s = createConnection(path);
          s.once("connect", () => resolve(s));
          s.once("error", reject);
        });
        return new Automation(socket);
      } catch (err) {
        if (Date.now() > deadline) throw err;
        await Bun.sleep(200);
      }
    }
  }

  request<T = any>(method: string, params?: object): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  async eval<T = any>(script: string, window?: number): Promise<T> {
    const r = await this.request<{ value: T }>("eval", { script, window });
    return r.value;
  }

  async capture(path: string, window?: number): Promise<void> {
    const r = await this.request<{ png: string }>("capture", { window });
    await Bun.write(path, Buffer.from(r.png, "base64"));
  }

  close() {
    this.socket.end();
  }
}
