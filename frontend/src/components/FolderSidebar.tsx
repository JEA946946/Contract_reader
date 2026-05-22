import { useCallback, useEffect, useState } from "react";
import type { Folder } from "../types";
import {
  getFolderTree,
  createFolder,
  renameFolder,
  deleteFolder,
  moveDocumentToFolder,
} from "../api/client";

type SelectedFolder =
  | { type: "all" }
  | { type: "unfiled" }
  | { type: "folder"; id: number }
  | { type: "status"; status: string };

interface StatusCounts {
  pending_review: number;
  completed: number;
  failed: number;
  zero_rows: number;
  processing: number;
}

interface FolderSidebarProps {
  selected: SelectedFolder;
  onSelect: (sel: SelectedFolder) => void;
  unfiledCount?: number;
  totalCount?: number;
  compact?: boolean;
  /** Called after a drag-drop move so parent can refresh */
  onDocumentMoved?: () => void;
  statusCounts?: StatusCounts;
}

export type { SelectedFolder };

const STATUS_ITEMS: { key: string; label: string; bg: string; color: string }[] = [
  { key: "pending_review", label: "Pending Review", bg: "#e3f2fd", color: "#1565c0" },
  { key: "completed", label: "Completed", bg: "#e8f5e9", color: "#2e7d32" },
  { key: "failed", label: "Failed", bg: "#ffebee", color: "#c62828" },
  { key: "zero_rows", label: "0 Rows", bg: "#fff3e0", color: "#e65100" },
  { key: "processing", label: "Processing", bg: "#fff3e0", color: "#e65100" },
];

export default function FolderSidebar({
  selected,
  onSelect,
  unfiledCount,
  totalCount,
  compact = false,
  onDocumentMoved,
  statusCounts,
}: FolderSidebarProps) {
  const [tree, setTree] = useState<Folder[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ folderId: number; x: number; y: number } | null>(null);
  const [creatingIn, setCreatingIn] = useState<number | null | "root">(null);
  const [newFolderName, setNewFolderName] = useState("");

  const refresh = useCallback(() => {
    getFolderTree().then(setTree).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRenameSubmit = async (folderId: number) => {
    if (renameValue.trim()) {
      await renameFolder(folderId, renameValue.trim());
      refresh();
    }
    setRenamingId(null);
  };

  const handleCreateSubmit = async () => {
    if (newFolderName.trim()) {
      const parentId = creatingIn === "root" ? null : creatingIn;
      await createFolder(newFolderName.trim(), parentId);
      if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
      refresh();
    }
    setCreatingIn(null);
    setNewFolderName("");
  };

  const handleDelete = async (folderId: number) => {
    if (!confirm("Delete this folder? Documents will be moved to parent.")) return;
    await deleteFolder(folderId);
    if (selected.type === "folder" && selected.id === folderId) {
      onSelect({ type: "all" });
    }
    refresh();
  };

  const handleDrop = async (e: React.DragEvent, folderId: number | null) => {
    e.preventDefault();
    e.currentTarget.classList.remove("folder-drag-over");
    const docId = e.dataTransfer.getData("application/x-document-id");
    if (!docId) return;
    await moveDocumentToFolder(parseInt(docId, 10), folderId);
    refresh();
    onDocumentMoved?.();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("folder-drag-over");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("folder-drag-over");
  };

  const width = compact ? 220 : 250;

  const countAll = (folders: Folder[]): number =>
    folders.reduce((sum, f) => sum + f.document_count + countAll(f.children), 0);
  const totalInFolders = countAll(tree);
  const totalDocs = totalCount ?? (totalInFolders + (unfiledCount ?? 0));

  const renderFolder = (folder: Folder, depth: number) => {
    const isExpanded = expanded.has(folder.id);
    const hasChildren = folder.children.length > 0;
    const isSelected = selected.type === "folder" && selected.id === folder.id;
    const isRenaming = renamingId === folder.id;
    const isAuto = folder.folder_type === "auto";

    return (
      <div key={folder.id}>
        <div
          onClick={() => {
            onSelect({ type: "folder", id: folder.id });
            if (hasChildren) toggleExpand(folder.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
          }}
          onDrop={(e) => handleDrop(e, folder.id)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            padding: compact ? "4px 8px" : "5px 10px",
            paddingLeft: `${depth * 16 + (compact ? 8 : 10)}px`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: compact ? "0.78rem" : "0.83rem",
            background: isSelected ? "rgba(105,108,255,0.1)" : "transparent",
            color: isSelected ? "#696cff" : "#555",
            borderRadius: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {/* Expand/collapse arrow */}
          <span style={{ width: 14, flexShrink: 0, fontSize: "0.7rem", color: "#888" }}>
            {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
          </span>
          {/* Folder icon */}
          <span style={{ flexShrink: 0, fontSize: compact ? "0.8rem" : "0.9rem" }}>
            {isAuto ? "📁" : "📂"}
          </span>
          {/* Name or rename input */}
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(folder.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit(folder.id);
                if (e.key === "Escape") setRenamingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                background: "#fff",
                border: "1px solid #696cff",
                borderRadius: 3,
                color: "#333",
                fontSize: "0.8rem",
                padding: "1px 4px",
                outline: "none",
                minWidth: 0,
              }}
            />
          ) : (
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={folder.name}
            >
              {folder.name}
            </span>
          )}
          {/* Doc count badge */}
          {folder.document_count > 0 && !isRenaming && (
            <span
              style={{
                fontSize: "0.68rem",
                background: "#f0f0f0",
                padding: "0 5px",
                borderRadius: 8,
                color: "#888",
                flexShrink: 0,
              }}
            >
              {folder.document_count}
            </span>
          )}
        </div>
        {/* Children */}
        {isExpanded &&
          folder.children
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => renderFolder(child, depth + 1))}
        {/* Creating subfolder inline */}
        {creatingIn === folder.id && isExpanded && (
          <div style={{ paddingLeft: `${(depth + 1) * 16 + 10}px`, padding: "3px 10px" }}>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={handleCreateSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSubmit();
                if (e.key === "Escape") { setCreatingIn(null); setNewFolderName(""); }
              }}
              placeholder="Folder name..."
              style={{
                background: "#fff",
                border: "1px solid #696cff",
                borderRadius: 3,
                color: "#333",
                fontSize: "0.8rem",
                padding: "2px 6px",
                outline: "none",
                width: "100%",
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        width,
        minWidth: width,
        background: "#f5f5f5",
        border: "none",
        borderRadius: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: compact ? "8px 10px" : "12px 14px",
          borderBottom: "1px solid #e8e8e8",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "#333", fontWeight: 600, fontSize: compact ? "0.85rem" : "0.95rem" }}>
          Folders
        </span>
        <button
          onClick={() => { setCreatingIn("root"); setNewFolderName(""); }}
          style={{
            background: "rgba(105,108,255,0.12)",
            border: "none",
            color: "#696cff",
            cursor: "pointer",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}
          title="New folder"
        >
          +
        </button>
      </div>

      {/* Scrollable tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {/* All Documents */}
        <div
          onClick={() => onSelect({ type: "all" })}
          style={{
            padding: compact ? "4px 10px" : "6px 14px",
            cursor: "pointer",
            fontSize: compact ? "0.78rem" : "0.83rem",
            color: selected.type === "all" ? "#696cff" : "#555",
            fontWeight: selected.type === "all" ? 600 : 400,
            background: selected.type === "all" ? "rgba(105,108,255,0.1)" : "transparent",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ fontSize: compact ? "0.8rem" : "0.9rem" }}>📋</span>
          All Documents
          <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "#999" }}>
            {totalDocs}
          </span>
        </div>

        {/* Status filters */}
        {statusCounts && STATUS_ITEMS.map((item) => {
          const count = statusCounts[item.key as keyof StatusCounts];
          const isActive = selected.type === "status" && selected.status === item.key;
          return (
            <div
              key={item.key}
              onClick={() => onSelect({ type: "status", status: item.key })}
              style={{
                padding: compact ? "3px 10px 3px 28px" : "4px 14px 4px 32px",
                cursor: "pointer",
                fontSize: compact ? "0.73rem" : "0.78rem",
                color: isActive ? item.color : "#888",
                fontWeight: isActive ? 600 : 400,
                background: isActive ? item.bg : "transparent",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: item.color,
                flexShrink: 0,
                opacity: isActive ? 1 : 0.5,
              }} />
              {item.label}
              {count > 0 && (
                <span style={{
                  marginLeft: "auto",
                  fontSize: "0.65rem",
                  background: isActive ? item.color : "#e8e8e8",
                  color: isActive ? "#fff" : "#888",
                  padding: "0 5px",
                  borderRadius: 8,
                  fontWeight: 600,
                  minWidth: 16,
                  textAlign: "center",
                }}>
                  {count}
                </span>
              )}
            </div>
          );
        })}

        {/* Unfiled */}
        <div
          onClick={() => onSelect({ type: "unfiled" })}
          onDrop={(e) => handleDrop(e, null)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            padding: compact ? "4px 10px" : "6px 14px",
            cursor: "pointer",
            fontSize: compact ? "0.78rem" : "0.83rem",
            color: selected.type === "unfiled" ? "#696cff" : "#555",
            fontWeight: selected.type === "unfiled" ? 600 : 400,
            background: selected.type === "unfiled" ? "rgba(105,108,255,0.1)" : "transparent",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ fontSize: compact ? "0.8rem" : "0.9rem" }}>📄</span>
          Unfiled
          {unfiledCount !== undefined && (
            <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "#999" }}>
              {unfiledCount}
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#e8e8e8", margin: "4px 10px" }} />

        {/* Creating root folder inline */}
        {creatingIn === "root" && (
          <div style={{ padding: "3px 14px" }}>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={handleCreateSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSubmit();
                if (e.key === "Escape") { setCreatingIn(null); setNewFolderName(""); }
              }}
              placeholder="Folder name..."
              style={{
                background: "#fff",
                border: "1px solid #696cff",
                borderRadius: 3,
                color: "#333",
                fontSize: "0.8rem",
                padding: "2px 6px",
                outline: "none",
                width: "100%",
              }}
            />
          </div>
        )}

        {/* Folder tree */}
        {tree
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((folder) => renderFolder(folder, 0))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: "#fff",
            border: "1px solid #e8e8e8",
            borderRadius: 6,
            padding: "4px 0",
            zIndex: 9999,
            minWidth: 140,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            {
              label: "Rename",
              action: () => {
                const folder = findFolder(tree, contextMenu.folderId);
                if (folder) { setRenamingId(folder.id); setRenameValue(folder.name); }
                setContextMenu(null);
              },
            },
            {
              label: "New Subfolder",
              action: () => {
                setCreatingIn(contextMenu.folderId);
                setExpanded((prev) => new Set(prev).add(contextMenu.folderId));
                setNewFolderName("");
                setContextMenu(null);
              },
            },
            {
              label: "Delete",
              action: () => {
                handleDelete(contextMenu.folderId);
                setContextMenu(null);
              },
              color: "#c62828",
            },
          ].map((item) => (
            <div
              key={item.label}
              onClick={item.action}
              style={{
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: "0.8rem",
                color: item.color || "#555",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#f5f5f5"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}

      {/* Drag-over style injection */}
      <style>{`
        .folder-drag-over {
          outline: 2px dashed #696cff !important;
          background: rgba(105,108,255,0.08) !important;
        }
      `}</style>
    </div>
  );
}

function findFolder(tree: Folder[], id: number): Folder | null {
  for (const f of tree) {
    if (f.id === id) return f;
    const child = findFolder(f.children, id);
    if (child) return child;
  }
  return null;
}
