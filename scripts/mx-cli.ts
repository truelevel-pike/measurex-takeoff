#!/usr/bin/env node
// Make this file a module to avoid TS2393 duplicate declaration errors across scripts
export {};
/**
 * MeasureX CLI — interact with the MeasureX API from the command line.
 * Usage: npm run mx -- <command> [args]
 *
 * Commands:
 *   projects list                              List all projects
 *   project create <name>                      Create a new project
 *   project get <id>                           Get project details
 *   polygons list <projectId>                  List polygons for a project
 *   polygon add <projectId> <classId> <json>   Add a polygon
 *   quantities <projectId>                     Show quantity takeoff summary
 *   takeoff <projectId> [page]                 Run AI takeoff on a project page
 *   export <projectId> [format]                Export project (excel|json)
 */

const BASE = process.env.MEASUREX_URL ?? "http://localhost:3000";

// ── ANSI helpers ──────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function heading(text: string) {
  console.log(`\n${c.bold}${c.cyan}${text}${c.reset}\n`);
}

function success(text: string) {
  console.log(`${c.green}✓${c.reset} ${text}`);
}

function logError(text: string) {
  console.error(`${c.red}✗ ${text}${c.reset}`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────
async function mxFetch(path: string, opts?: RequestInit): Promise<Response> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    let msg: string;
    try {
      msg = JSON.parse(body).error ?? body;
    } catch {
      msg = body;
    }
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }
  return res;
}

async function mxJson(path: string, opts?: RequestInit) {
  const res = await mxFetch(path, opts);
  return res.json();
}

// ── Commands ──────────────────────────────────────────────────────────

async function projectsList() {
  heading("Projects");
  const { projects } = await mxJson("/api/projects");
  if (!projects?.length) {
    console.log("  (no projects)");
    return;
  }
  console.table(
    projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      pages: p.totalPages ?? p.state?.totalPages ?? "–",
      updated: p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "–",
    }))
  );
}

async function projectCreate(name: string) {
  const { project } = await mxJson("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  success(`Created project "${project.name}" (${project.id})`);
}

async function projectGet(id: string) {
  const { project } = await mxJson(`/api/projects/${id}`);
  heading(`Project: ${project.name}`);
  console.log(`  ${c.dim}ID:${c.reset}       ${project.id}`);
  console.log(`  ${c.dim}Created:${c.reset}  ${project.createdAt ?? "–"}`);
  console.log(`  ${c.dim}Updated:${c.reset}  ${project.updatedAt ?? "–"}`);

  if (project.state) {
    const s = project.state;
    console.log(`  ${c.dim}Pages:${c.reset}    ${s.totalPages ?? "–"}`);
    if (s.scale) {
      console.log(
        `  ${c.dim}Scale:${c.reset}    ${s.scale.pixelsPerUnit} px/${s.scale.unit} (${s.scale.source ?? "manual"})`
      );
    }
    if (s.classifications?.length) {
      console.log(`  ${c.dim}Classifications:${c.reset} ${s.classifications.length}`);
    }
    if (s.polygons?.length) {
      console.log(`  ${c.dim}Polygons:${c.reset} ${s.polygons.length}`);
    }
  }
}

async function polygonsList(projectId: string) {
  heading("Polygons");
  const { polygons } = await mxJson(`/api/projects/${projectId}/polygons`);
  if (!polygons?.length) {
    console.log("  (no polygons)");
    return;
  }
  console.table(
    polygons.map((p: any) => ({
      id: p.id.slice(0, 8) + "…",
      classification: p.classificationId?.slice(0, 8) + "…",
      page: p.pageNumber ?? "–",
      points: p.points?.length ?? 0,
      area: p.area ? p.area.toFixed(1) : "–",
      linearFt: p.linearFeet ? p.linearFeet.toFixed(1) : "–",
      label: p.label ?? "",
    }))
  );
}

async function polygonAdd(
  projectId: string,
  classificationId: string,
  pointsJson: string
) {
  let points: any[];
  try {
    points = JSON.parse(pointsJson);
  } catch {
    throw new Error("Invalid JSON for points. Expected: [[x,y],[x,y],...]");
  }
  // Normalise [[x,y]] to [{x,y}]
  if (Array.isArray(points[0])) {
    points = points.map(([x, y]: [number, number]) => ({ x, y }));
  }

  const { polygon } = await mxJson(`/api/projects/${projectId}/polygons`, {
    method: "POST",
    body: JSON.stringify({ points, classificationId }),
  });
  success(`Created polygon ${polygon.id}`);
}

async function quantities(projectId: string) {
  heading("Quantities");
  const data = await mxJson(`/api/projects/${projectId}/quantities`);
  const qs = data.quantities;
  if (!qs?.length) {
    console.log("  (no quantities)");
    return;
  }
  console.table(
    qs.map((q: any) => ({
      name: q.name,
      type: q.type,
      count: q.count,
      area: q.area ? `${q.area.toFixed(2)} ${q.unit ?? "SF"}` : "–",
      linear: q.linearFeet ? `${q.linearFeet.toFixed(2)} FT` : "–",
    }))
  );
  if (data.scale) {
    console.log(
      `  ${c.dim}Scale: ${data.scale.pixelsPerUnit} px/${data.scale.unit}${c.reset}`
    );
  }
}

async function takeoff(projectId: string, page: number) {
  heading("AI Takeoff");
  console.log(`  Running AI analysis on project ${projectId}, page ${page}…`);
  const data = await mxJson(`/api/projects/${projectId}/ai-takeoff`, {
    method: "POST",
    body: JSON.stringify({ page }),
  });
  const elements = data.elements ?? data.results ?? [];
  if (!elements.length) {
    console.log("  AI detected no elements.");
    return;
  }
  success(`Detected ${elements.length} element(s):`);
  console.table(
    elements.map((e: any) => ({
      name: e.name ?? e.classification ?? "–",
      type: e.type ?? "–",
      points: e.points?.length ?? 0,
      color: e.color ?? "–",
    }))
  );
}

async function exportProject(projectId: string, format: string) {
  const fmt = format === "json" ? "json" : "excel";
  heading(`Export (${fmt})`);
  const res = await mxFetch(`/api/projects/${projectId}/export/${fmt}`);
  const ext = fmt === "json" ? "json" : "xlsx";
  const filename = `./export.${ext}`;

  const { writeFileSync } = await import("fs");
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filename, buf);
  success(`Saved to ${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
}

// ── Usage ─────────────────────────────────────────────────────────────
function usage() {
  console.log(`
${c.bold}MeasureX CLI${c.reset}  ${c.dim}(${BASE})${c.reset}

${c.bold}Usage:${c.reset}  npm run mx -- <command> [args]

${c.bold}Commands:${c.reset}
  projects list                              List all projects
  project create <name>                      Create a new project
  project get <id>                           Get project details
  polygons list <projectId>                  List polygons
  polygon add <pid> <classId> '<points>'     Add a polygon
  quantities <projectId>                     Quantity takeoff summary
  takeoff <projectId> [page=1]               AI takeoff analysis
  export <projectId> [excel|json]            Export project

${c.bold}Environment:${c.reset}
  MEASUREX_URL  API base URL (default: http://localhost:3000)
`);
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    usage();
    process.exit(0);
  }

  const cmd = args[0];
  const sub = args[1];

  try {
    if (cmd === "projects" && sub === "list") {
      await projectsList();
    } else if (cmd === "project" && sub === "create") {
      const name = args.slice(2).join(" ");
      if (!name) throw new Error("Usage: project create <name>");
      await projectCreate(name);
    } else if (cmd === "project" && sub === "get") {
      if (!args[2]) throw new Error("Usage: project get <id>");
      await projectGet(args[2]);
    } else if (cmd === "polygons" && sub === "list") {
      if (!args[2]) throw new Error("Usage: polygons list <projectId>");
      await polygonsList(args[2]);
    } else if (cmd === "polygon" && sub === "add") {
      if (!args[2] || !args[3] || !args[4])
        throw new Error(
          "Usage: polygon add <projectId> <classificationId> '<points-json>'"
        );
      await polygonAdd(args[2], args[3], args[4]);
    } else if (cmd === "quantities") {
      if (!sub) throw new Error("Usage: quantities <projectId>");
      await quantities(sub);
    } else if (cmd === "takeoff") {
      if (!sub) throw new Error("Usage: takeoff <projectId> [page]");
      await takeoff(sub, parseInt(args[2] ?? "1", 10));
    } else if (cmd === "export") {
      if (!sub) throw new Error("Usage: export <projectId> [excel|json]");
      await exportProject(sub, args[2] ?? "excel");
    } else {
      logError(`Unknown command: ${cmd} ${sub ?? ""}`);
      usage();
      process.exit(1);
    }
  } catch (err: any) {
    logError(err.message);
    process.exit(1);
  }
}

main();
