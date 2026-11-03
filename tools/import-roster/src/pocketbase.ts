import { createHash } from "node:crypto";

export interface PbConfig {
  url: string;
  email: string;
  password: string;
}

export async function authenticate(config: PbConfig): Promise<string> {
  const response = await fetch(config.url + "/api/collections/_superusers/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: config.email, password: config.password }),
  });
  if (!response.ok) {
    throw new Error("superuser authentication failed: " + response.status);
  }
  const data = await response.json();
  return data.token as string;
}

export async function listRecords(token: string, url: string, collection: string, filter?: string): Promise<any[]> {
  const items: any[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ perPage: "200", page: String(page) });
    if (filter) params.set("filter", filter);
    const response = await fetch(url + "/api/collections/" + collection + "/records?" + params.toString(), {
      headers: { Authorization: "Bearer " + token },
    });
    if (!response.ok) throw new Error("list " + collection + " failed: " + response.status);
    const data = await response.json();
    items.push(...(data.items || []));
    if (page >= (data.totalPages || 1)) break;
    page++;
  }
  return items;
}

export async function createRecord(token: string, url: string, collection: string, body: any): Promise<any> {
  const response = await fetch(url + "/api/collections/" + collection + "/records", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("create " + collection + " failed: " + response.status + " " + text);
  }
  return response.json();
}

export async function updateRecord(token: string, url: string, collection: string, id: string, body: any): Promise<any> {
  const response = await fetch(url + "/api/collections/" + collection + "/records/" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("update " + collection + " failed: " + response.status + " " + text);
  }
  return response.json();
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
