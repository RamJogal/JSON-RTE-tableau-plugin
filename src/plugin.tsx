/** @jsx jsx */
import React, { useEffect, useRef, useState } from "react";
import { jsx } from "@emotion/core";
import ContentstackSDK from "@contentstack/app-sdk";
import { Icon } from "@contentstack/venus-components";

/** ───────────────────────── Types ───────────────────────── */
type ToolbarPos = "bottom" | "top" | "hidden";

interface TableauParams {
  server: string;
  workbook: string;
  view: string;
  width: number | string;
  height: number;
  toolbar?: ToolbarPos;
  inline?: boolean;
  label?: string;
}

interface TableauEmbedNode {
  type: string; // plugin name
  attrs: TableauParams;
  children: Array<{ text: string }>;
}

/** ──────────────────────── Helpers ──────────────────────── */
/** Use colon-prefixed params (Tableau embed expects these) */
function buildTableauUrl({
  server,
  workbook,
  view,
  toolbar,
}: {
  server: string;
  workbook: string;
  view: string;
  toolbar?: ToolbarPos;
}): string {
  const base = `${server.replace(/\/$/, "")}/views/${encodeURIComponent(
    workbook
  )}/${encodeURIComponent(view)}`;
  return `${base}?:embed=y&:showVizHome=no${toolbar ? `&:toolbar=${toolbar}` : ""}`;
}

/** ─────────────────── Preset public demos ───────────────────
 * These do NOT require sign-in and are iframe-friendly.
 */
const PUBLIC_PRESETS: Array<{
  label: string;
  server: string;
  workbook: string;
  view: string;
}> = [
  {
    label: "Superstore – Overview",
    server: "https://public.tableau.com",
    workbook: "Superstore_116",
    view: "Overview",
  },
  {
    label: "Regional Sample – Storms",
    server: "https://public.tableau.com",
    workbook: "RegionalSampleWorkbook",
    view: "Storms",
  },
  {
    label: "World Indicators – GDP per capita",
    server: "https://public.tableau.com",
    workbook: "WorldIndicators",
    view: "GDPpercapita",
  },
  {
    label: "COVID-19 – Dashboard1",
    server: "https://public.tableau.com",
    workbook: "COVID-19Cases_15855288078310",
    view: "Dashboard1",
  },
  {
    label: "Global Superstore – OrdersDashboard",
    server: "https://public.tableau.com",
    workbook: "GlobalSuperstoreOrders",
    view: "OrdersDashboard",
  },
];

/**
 * Minimal picker with presets + custom option (prompt-based to keep single-file).
 * Replace later with a proper modal if you like.
 */
async function openTableauPicker(
  defaults: Partial<TableauParams> = {}
): Promise<TableauParams | null> {
  const menu =
    PUBLIC_PRESETS.map((p, i) => `${i + 1}. ${p.label}`).join("\n") +
    `\n${PUBLIC_PRESETS.length + 1}. Custom…`;

  const choiceRaw = window.prompt(
    `Pick a Tableau view to insert:\n\n${menu}\n\nEnter a number:`,
    "1"
  );
  const choice = Number(choiceRaw);

  // If a valid preset picked
  if (!Number.isNaN(choice) && choice >= 1 && choice <= PUBLIC_PRESETS.length) {
    const preset = PUBLIC_PRESETS[choice - 1];
    return {
      server: preset.server,
      workbook: preset.workbook,
      view: preset.view,
      width: defaults.width ?? "100%",
      height: defaults.height ?? 520,
      toolbar: defaults.toolbar ?? "bottom",
      inline: defaults.inline ?? false,
      label: preset.label,
    };
  }

  // Custom flow (same as your old prompts)
  const server =
    window.prompt(
      "Tableau Server / Site URL",
      defaults.server ?? "https://public.tableau.com"
    ) || "";
  if (!server) return null;

  const workbook =
    window.prompt("Workbook", defaults.workbook ?? "Superstore_116") || "";
  if (!workbook) return null;

  const view = window.prompt("View", defaults.view ?? "Overview") || "";
  if (!view) return null;

  const widthStr =
    window.prompt("Width (px or 100%)", String(defaults.width ?? "100%")) ||
    "100%";
  const heightStr =
    window.prompt("Height (px)", String(defaults.height ?? 520)) || "520";
  const toolbarIn =
    (window.prompt(
      "Toolbar (bottom|top|hidden)",
      defaults.toolbar ?? "bottom"
    ) || "bottom") as ToolbarPos;
  const inline =
    (window.prompt("Inline? (y/n)", defaults.inline ? "y" : "n") || "n")
      .toLowerCase() === "y";

  const width: number | string = /%$/.test(widthStr)
    ? widthStr
    : Number(widthStr) || "100%";
  const height: number = Number(heightStr) || 520;
  const toolbar: ToolbarPos =
    toolbarIn === "top" || toolbarIn === "hidden" ? toolbarIn : "bottom";

  return {
    server,
    workbook,
    view,
    width,
    height,
    toolbar,
    inline,
    label: `${workbook}/${view}`,
  };
}

/** ────────────── Editor preview element (in-RTE) ───────────── */
function TableauElement(props: any) {
  const { element, attributes, children, rte } = props;
  const pluginName = rte?.name || "tableau_embed";
  if (element?.type !== pluginName) return <div>{children}</div>;

  // current attrs
  const {
    server,
    workbook,
    view,
    width: widthAttr = "100%",
    height: heightAttr = 520,
    toolbar = "bottom",
    label,
  } = (element.attrs || {}) as TableauParams;

  // local UI state while dragging/typing
  const [width, setWidth] = useState<number | string>(widthAttr);
  const [height, setHeight] = useState<number>(Number(heightAttr) || 520);

  // write changes back to the node
  const persistSize = (w: number | string, h: number) => {
    setWidth(w);
    setHeight(h);
    if (typeof rte?.updateNode === "function") {
    console.info("element",element)
      rte.updateNode({
        ...element,
        attrs: {
          ...(element.attrs || {}),
          width: w,
          height: h,
        },
      });
    }
  };

  const src = buildTableauUrl({ server, workbook, view, toolbar });

  // -------- Drag handle logic (bottom-right corner) --------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const onDragStart: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const startW =
      typeof width === "number"
        ? width
        : (containerRef.current?.getBoundingClientRect().width ?? 0);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: startW,
      startH: height,
    };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  };

  const onDragMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    const nextW = Math.max(240, Math.round(dragRef.current.startW + dx)); // min 240px
    const nextH = Math.max(200, Math.round(dragRef.current.startH + dy)); // min 200px

    // live-update UI only
    setWidth(nextW);
    setHeight(nextH);
  };

  const onDragEnd = () => {
    if (!dragRef.current) return;
    const finalW =
      typeof width === "number"
        ? Math.max(240, width)
        : (containerRef.current?.getBoundingClientRect().width ?? 520);
    const finalH = Math.max(200, height);
    persistSize(finalW, finalH);

    dragRef.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onDragMove);
      window.removeEventListener("mouseup", onDragEnd);
    };
  }, []);

  // quick actions
  const setFitWidth = () => persistSize("100%", height);
  const setHeightPreset = (h: number) => persistSize(width, h);

  const edit = () => typeof rte?.exec === "function" && rte.exec();
  const remove = () =>
    typeof rte?.deleteNode === "function" && rte.deleteNode(element);

  const containerWidthStyle =
    typeof width === "number" ? `${width}px` : (width || "100%");

  return (
    <div
      {...attributes}
      contentEditable={false}
      css={{
        border: "1px solid #dcdcdc",
        padding: 12,
        margin: "12px 0",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      {/* Header */}
      <div
        css={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div css={{ fontWeight: 600 }}>
          📊 Tableau: {label || `${workbook}/${view}`}
        </div>
        <div css={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Size controls */}
          <div css={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 12 }}>W</label>
            <input
              type="text"
              value={typeof width === "number" ? String(width) : width}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v.endsWith("%")) setWidth(v);
                else {
                  const n = Number(v);
                  if (!Number.isNaN(n)) setWidth(n);
                }
              }}
              onBlur={() => {
                const w =
                  typeof width === "number"
                    ? Math.max(240, Math.round(width))
                    : width || "100%";
                persistSize(w, height);
              }}
              css={{
                width: 70,
                fontSize: 12,
                padding: "4px 6px",
                border: "1px solid #ccc",
                borderRadius: 4,
                background: "#fff",
              }}
              placeholder="100% or px"
            />
            <label style={{ fontSize: 12 }}>H</label>
            <input
              type="number"
              value={height}
              min={200}
              step={10}
              onChange={(e) => setHeight(Number(e.target.value) || 520)}
              onBlur={() => persistSize(width, Math.max(200, height))}
              css={{
                width: 70,
                fontSize: 12,
                padding: "4px 6px",
                border: "1px solid #ccc",
                borderRadius: 4,
                background: "#fff",
              }}
            />
            <button
              type="button"
              onClick={setFitWidth}
              css={{
                fontSize: 12,
                padding: "4px 8px",
                border: "1px solid #ccc",
                borderRadius: 4,
                background: "white",
                cursor: "pointer",
              }}
              title="Fit width (100%)"
            >
              Fit
            </button>
            {[400, 520, 680].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHeightPreset(h)}
                css={{
                  fontSize: 12,
                  padding: "4px 8px",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: "white",
                  cursor: "pointer",
                }}
              >
                {h}px
              </button>
            ))}
          </div>

          {/* Edit / Remove */}
          <button
            type="button"
            onClick={edit}
            css={{
              padding: "6px 10px",
              border: "1px solid #ccc",
              borderRadius: 6,
              background: "white",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={remove}
            css={{
              padding: "6px 10px",
              border: "1px solid #e74c3c",
              borderRadius: 6,
              background: "#ffecec",
              color: "#e74c3c",
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        </div>
      </div>

      {/* Preview + drag handle */}
      <div
        ref={containerRef}
        css={{ width: "100%", overflow: "hidden", position: "relative" }}
      >
        <div css={{ width: containerWidthStyle }}>
          <iframe
            src={src}
            title={`tableau-${workbook}-${view}`}
            loading="lazy"
            allowFullScreen
            /* NOTE: no sandbox — Tableau auth/embedding breaks with sandboxed iframes */
            style={{
              display: "block",
              width: "100%",
              height: `${Number(height) || 520}px`,
              border: 0,
              background: "#fff",
            }}
          />
        </div>

        {/* Drag handle (bottom-right corner) */}
        <div
          onMouseDown={onDragStart}
          css={{
            position: "absolute",
            right: 6,
            bottom: 6,
            width: 14,
            height: 14,
            borderRadius: 3,
            background: "#e0e0e0",
            border: "1px solid #c8c8c8",
            cursor: "nwse-resize",
            boxShadow: "inset 0 0 0 1px #fff",
          }}
          title="Drag to resize"
        />
      </div>

      {/* keep children for RTE schema */}
      <div style={{ display: "none" }}>{children}</div>
    </div>
  );
}

/** ───────────────────── Entry point / Plugin ───────────────────── */
export default ContentstackSDK.init()
  .then(async (sdk) => {
    const extensionObj = await (sdk as any)?.location;
    const RTEPlugin = await extensionObj?.RTEPlugin;
    if (!RTEPlugin) return {};

    // Name used as node.type
    const PLUGIN_NAME = "tableau_embed";

    const Tableau = RTEPlugin(PLUGIN_NAME, (rte: any) => {
      // Optional inline behavior
      const originalIsInline = rte?._adv?.editor?.isInline;
      if (originalIsInline) {
        rte._adv.editor.isInline = (element: any) => {
          if (element?.type === PLUGIN_NAME && element?.attrs?.inline) return true;
          return originalIsInline(element);
        };
      }

      return {
        title: "Insert Tableau Embed",
        icon: <Icon icon="Table" size="original" />,
        render: TableauElement,
        display: ["toolbar"],
        elementType: ["void"],

        onClick: async () => {
          const picked = await openTableauPicker();
          if (!picked) return;

          const node: TableauEmbedNode = {
            type: PLUGIN_NAME,
            attrs: {
              server: picked.server,
              workbook: picked.workbook,
              view: picked.view,
              width: picked.width,
              height: picked.height,
              toolbar: picked.toolbar,
              inline: !!picked.inline,
              label: picked.label,
            },
            children: [{ text: "" }],
          };

          if (typeof rte?.insertNode === "function") {
            rte.insertNode(node);
          }
        },
      };
    });

    // Edit existing node via toolbar
    // @ts-ignore
    Tableau.on("exec", async (ctx: any) => {
      const current = ctx?.element;
      const defaults: Partial<TableauParams> = current?.attrs || {};
      const picked = await openTableauPicker(defaults);
      if (!picked) return;

      const updated: TableauEmbedNode = {
        type: PLUGIN_NAME,
        attrs: {
          server: picked.server,
          workbook: picked.workbook,
          view: picked.view,
          width: picked.width,
          height: picked.height,
          toolbar: picked.toolbar,
          inline: !!picked.inline,
          label: picked.label,
        },
        children: [{ text: "" }],
      };

      if (current?.type === PLUGIN_NAME && typeof ctx?.updateNode === "function") {
        ctx.updateNode({ ...current, ...updated });
      } else if (typeof ctx?.insertNode === "function") {
        ctx.insertNode(updated);
      }
    });

    return { Tableau };
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Error loading tableau_embed plugin:", err);
  });
