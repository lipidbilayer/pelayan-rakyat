const API_URL = (process.env.PB_PUBLIC_URL || "http://127.0.0.1:8090").replace(/\/$/, "");

async function fetchCollection(name: string, filter?: string): Promise<any[]> {
  const items: any[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({ perPage: "200", page: String(page) });
    if (filter) params.set("filter", filter);
    const response = await fetch(`${API_URL}/api/collections/${name}/records?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${name}: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    items.push(...(data.items || []));
    if (page >= (data.totalPages || 1)) break;
    page += 1;
  }
  return items;
}

export async function loadSnapshot() {
  const [parties, people, institutions, dapils, sources, positions, statusEvents] = await Promise.all([
    fetchCollection("parties", "verification_status='verified'"),
    fetchCollection("people", "verification_status='verified'"),
    fetchCollection("institutions"),
    fetchCollection("dapil"),
    fetchCollection("sources"),
    fetchCollection("positions", "verification_status='verified'"),
    fetchCollection("status_events", "verification_status='verified'"),
  ]);

  const partyById = new Map(parties.map((x) => [x.id, x]));
  const personById = new Map(people.map((x) => [x.id, x]));
  const institutionById = new Map(institutions.map((x) => [x.id, x]));
  const dapilById = new Map(dapils.map((x) => [x.id, x]));
  const sourceById = new Map(sources.map((x) => [x.id, x]));

  const positionsByPerson = new Map<string, any[]>();
  for (const position of positions) {
    const list = positionsByPerson.get(position.person) || [];
    list.push(position);
    positionsByPerson.set(position.person, list);
  }

  const statusEventsByPosition = new Map<string, any[]>();
  for (const event of statusEvents) {
    const list = statusEventsByPosition.get(event.position) || [];
    list.push(event);
    statusEventsByPosition.set(event.position, list);
  }

  // Safety check against the last successful build manifest.
  const lastManifestPath = process.env.LAST_MANIFEST_PATH || "last-manifest.json";
  let lastPeopleCount: number | null = null;
  try {
    const fs = await import("node:fs");
    const raw = fs.readFileSync(lastManifestPath, "utf8");
    const parsed = JSON.parse(raw);
    lastPeopleCount = parsed?.counts?.people ?? null;
  } catch (e) {
    lastPeopleCount = null;
  }
  if (lastPeopleCount !== null && lastPeopleCount > 0) {
    const allowDrop = process.env.ALLOW_DROP === "true";
    if (people.length < lastPeopleCount * 0.8 && !allowDrop) {
      throw new Error(`Verified people dropped from ${lastPeopleCount} to ${people.length}; build aborted.`);
    }
  }

  const recentChanges = buildRecentChanges(positions, statusEvents, people, institutions, partyById, sourceById);

  return {
    api: API_URL,
    parties,
    people,
    institutions,
    dapils,
    sources: sourceById,
    positions,
    statusEvents,
    partyById,
    personById,
    institutionById,
    dapilById,
    sourceById,
    positionsByPerson,
    statusEventsByPosition,
    recentChanges,
    counts: {
      people: people.length,
      parties: parties.length,
      positions: positions.length,
      institutions: institutions.length,
      dapils: dapils.length,
      sources: sources.length,
    },
  };
}

function buildRecentChanges(positions: any[], statusEvents: any[], people: any[], institutions: any[], partyById: Map<string, any>, sourceById: Map<string, any>) {
  const personById = new Map(people.map((x) => [x.id, x]));
  const institutionById = new Map(institutions.map((x) => [x.id, x]));
  const events: any[] = [];
  for (const position of positions) {
    if (position.start_date) {
      events.push({
        type: "start",
        date: position.start_date,
        person: personById.get(position.person),
        position,
        institution: institutionById.get(position.institution),
        sources: (position.sources || []).map((id: string) => sourceById.get(id)).filter(Boolean),
      });
    }
    if (position.status === "ended" && position.end_date) {
      events.push({
        type: "end",
        date: position.end_date,
        person: personById.get(position.person),
        position,
        institution: institutionById.get(position.institution),
        sources: (position.sources || []).map((id: string) => sourceById.get(id)).filter(Boolean),
      });
    }
  }
  for (const event of statusEvents) {
    const position = positions.find((x) => x.id === event.position);
    if (!position) continue;
    events.push({
      type: "status",
      date: event.effective_date,
      person: personById.get(position.person),
      position,
      institution: institutionById.get(position.institution),
      event,
      sources: (event.sources || []).map((id: string) => sourceById.get(id)).filter(Boolean),
    });
  }
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return events.slice(0, 10);
}

export function formatDate(value: string | null, precision?: string): string {
  if (!value) return "tanggal tidak diketahui";
  const date = new Date(value);
  if (precision === "month") {
    return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", month: "long", year: "numeric" }).format(date);
  }
  if (precision === "unknown") return "tanggal tidak diketahui";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}
