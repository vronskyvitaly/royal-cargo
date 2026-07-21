"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type Board, type BoardColumn, type BoardCard, type ArticleSearchResult } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";

type DragItem =
  | { type: "column"; id: number }
  | { type: "card"; id: number; columnId: number }
  | { type: "columnBody"; columnId: number };

function findColumnIdForCard(
  cardsByColumn: Record<number, BoardCard[]>,
  cardId: number
): number | undefined {
  for (const [colId, list] of Object.entries(cardsByColumn)) {
    if (list.some((c) => c.id === cardId)) return Number(colId);
  }
  return undefined;
}

export default function KanbanBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const numId = Number(id);
  const router = useRouter();
  const { user } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [cardsByColumn, setCardsByColumn] = useState<Record<number, BoardCard[]>>({});
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameInput, setBoardNameInput] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    api.boards.get(numId).then((b) => {
      setBoard(b);
      const cols = [...(b.columns ?? [])].sort((a, c) => a.position - c.position);
      setColumns(cols);
      const grouped: Record<number, BoardCard[]> = {};
      for (const c of cols) grouped[c.id] = [];
      for (const card of b.cards ?? []) {
        (grouped[card.column_id] ??= []).push(card);
      }
      for (const k of Object.keys(grouped)) grouped[Number(k)].sort((a, c) => a.position - c.position);
      setCardsByColumn(grouped);
    }).finally(() => setLoading(false));
  }, [numId]);

  // Real-time sync
  useEffect(() => {
    const socket = getSocket();

    const upsertColumn = (col: BoardColumn) => {
      if (col.board_id !== numId) return;
      setColumns((prev) => {
        const idx = prev.findIndex((c) => c.id === col.id);
        const next = idx >= 0 ? prev.map((c) => (c.id === col.id ? col : c)) : [...prev, col];
        return next.sort((a, c) => a.position - c.position);
      });
      setCardsByColumn((prev) => (prev[col.id] ? prev : { ...prev, [col.id]: [] }));
    };

    const removeColumn = ({ id: colId, board_id }: { id: number; board_id: number }) => {
      if (board_id !== numId) return;
      setColumns((prev) => prev.filter((c) => c.id !== colId));
      setCardsByColumn((prev) => {
        const next = { ...prev };
        delete next[colId];
        return next;
      });
    };

    const applyColumnOrder = ({
      board_id,
      order,
    }: {
      board_id: number;
      order: { id: number; position: number }[];
    }) => {
      if (board_id !== numId) return;
      setColumns((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        const next = order
          .map((o) => {
            const c = byId.get(o.id);
            return c ? { ...c, position: o.position } : null;
          })
          .filter((c): c is BoardColumn => !!c);
        return next.length === prev.length ? next.sort((a, c) => a.position - c.position) : prev;
      });
    };

    const upsertCard = (card: BoardCard) => {
      if (card.board_id !== numId) return;
      setCardsByColumn((prev) => {
        const next: Record<number, BoardCard[]> = {};
        for (const [colId, list] of Object.entries(prev)) {
          next[Number(colId)] = list.filter((c) => c.id !== card.id);
        }
        const dest = next[card.column_id] ?? [];
        next[card.column_id] = [...dest, card].sort((a, c) => a.position - c.position);
        return next;
      });
    };

    const removeCard = ({ id: cardId, board_id }: { id: number; board_id: number }) => {
      if (board_id !== numId) return;
      setCardsByColumn((prev) => {
        const next: Record<number, BoardCard[]> = {};
        for (const [colId, list] of Object.entries(prev)) next[Number(colId)] = list.filter((c) => c.id !== cardId);
        return next;
      });
    };

    const applyCardOrder = ({
      board_id,
      column_id,
      order,
    }: {
      board_id: number;
      column_id: number;
      order: { id: number; position: number }[];
    }) => {
      if (board_id !== numId) return;
      setCardsByColumn((prev) => {
        const allCards = Object.values(prev).flat();
        const byId = new Map(allCards.map((c) => [c.id, c]));
        const movingIds = new Set(order.map((o) => o.id));
        const next: Record<number, BoardCard[]> = {};
        for (const [colId, list] of Object.entries(prev)) {
          next[Number(colId)] = list.filter((c) => !movingIds.has(c.id));
        }
        const dest = order
          .slice()
          .sort((a, c) => a.position - c.position)
          .map((o) => {
            const c = byId.get(o.id);
            return c ? { ...c, column_id, position: o.position } : null;
          })
          .filter((c): c is BoardCard => !!c);
        next[column_id] = dest;
        return next;
      });
    };

    const onBoardUpdated = (b: Board) => {
      if (b.id === numId) setBoard((prev) => (prev ? { ...prev, ...b } : prev));
    };
    const onBoardDeleted = ({ id: bId }: { id: number }) => {
      if (bId === numId) router.replace("/kanban");
    };

    socket.on("board:updated", onBoardUpdated);
    socket.on("board:deleted", onBoardDeleted);
    socket.on("column:created", upsertColumn);
    socket.on("column:updated", upsertColumn);
    socket.on("column:deleted", removeColumn);
    socket.on("columns:reordered", applyColumnOrder);
    socket.on("card:created", upsertCard);
    socket.on("card:updated", upsertCard);
    socket.on("card:deleted", removeCard);
    socket.on("card:moved", applyCardOrder);
    return () => {
      socket.off("board:updated", onBoardUpdated);
      socket.off("board:deleted", onBoardDeleted);
      socket.off("column:created", upsertColumn);
      socket.off("column:updated", upsertColumn);
      socket.off("column:deleted", removeColumn);
      socket.off("columns:reordered", applyColumnOrder);
      socket.off("card:created", upsertCard);
      socket.off("card:updated", upsertCard);
      socket.off("card:deleted", removeCard);
      socket.off("card:moved", applyCardOrder);
    };
  }, [numId, router]);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragItem | undefined;
    if (data?.type === "card") {
      setActiveCard(cardsByColumn[data.columnId]?.find((c) => c.id === data.id) ?? null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as DragItem | undefined;
    if (activeData?.type !== "card") return;
    const overData = over.data.current as DragItem | undefined;
    if (!overData) return;

    const activeColumnId = findColumnIdForCard(cardsByColumn, activeData.id);
    const overColumnId = overData.type === "column" ? undefined : overData.columnId;
    if (overColumnId === undefined || activeColumnId === undefined || activeColumnId === overColumnId) return;

    setCardsByColumn((prev) => {
      const from = prev[activeColumnId] ?? [];
      const to = prev[overColumnId] ?? [];
      const card = from.find((c) => c.id === activeData.id);
      if (!card) return prev;
      const newFrom = from.filter((c) => c.id !== activeData.id);
      let insertIndex = to.length;
      if (overData.type === "card") {
        const idx = to.findIndex((c) => c.id === overData.id);
        if (idx !== -1) insertIndex = idx;
      }
      const newTo = [...to.slice(0, insertIndex), { ...card, column_id: overColumnId }, ...to.slice(insertIndex)];
      return { ...prev, [activeColumnId]: newFrom, [overColumnId]: newTo };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;
    const activeData = active.data.current as DragItem | undefined;

    if (activeData?.type === "column") {
      const overData = over.data.current as DragItem | undefined;
      const overColId = overData?.type === "column" ? overData.id : undefined;
      if (overColId === undefined) return;
      const oldIndex = columns.findIndex((c) => c.id === activeData.id);
      const newIndex = columns.findIndex((c) => c.id === overColId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const reordered = arrayMove(columns, oldIndex, newIndex);
      setColumns(reordered);
      api.boards.columns.reorder(numId, reordered.map((c) => c.id)).catch(() => {});
      return;
    }

    if (activeData?.type === "card") {
      const columnId = findColumnIdForCard(cardsByColumn, activeData.id);
      if (columnId === undefined) return;
      const overData = over.data.current as DragItem | undefined;
      const list = cardsByColumn[columnId] ?? [];

      if (overData?.type === "card" && overData.id !== activeData.id && overData.columnId === columnId) {
        const oldIndex = list.findIndex((c) => c.id === activeData.id);
        const newIndex = list.findIndex((c) => c.id === overData.id);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(list, oldIndex, newIndex);
          setCardsByColumn((prev) => ({ ...prev, [columnId]: reordered }));
          api.boards.cards.move(numId, activeData.id, columnId, reordered.map((c) => c.id)).catch(() => {});
          return;
        }
      }
      api.boards.cards.move(numId, activeData.id, columnId, list.map((c) => c.id)).catch(() => {});
    }
  }

  async function addColumn(name: string) {
    if (!name.trim()) return;
    await api.boards.columns.create(numId, name.trim());
  }

  async function renameColumn(columnId: number, name: string) {
    if (!name.trim()) return;
    await api.boards.columns.rename(numId, columnId, name.trim());
  }

  async function deleteColumn(columnId: number) {
    if (!confirm("Удалить колонку вместе со всеми карточками?")) return;
    try {
      await api.boards.columns.remove(numId, columnId);
    } catch (e) {
      alert(String(e));
    }
  }

  async function addArticleCard(columnId: number, article: ArticleSearchResult) {
    try {
      await api.boards.cards.create(numId, columnId, article.title, undefined, article.id);
    } catch (e) {
      alert(String(e));
    }
  }

  async function updateCard(cardId: number, data: { title?: string; description?: string }) {
    await api.boards.cards.update(numId, cardId, data);
  }

  async function deleteCard(cardId: number) {
    await api.boards.cards.remove(numId, cardId);
  }

  async function renameBoard(name: string) {
    if (!name.trim() || name.trim() === board?.name) return;
    await api.boards.update(numId, { name: name.trim() });
  }

  if (loading) {
    return <p className="text-gray-400 p-8 text-center">Загрузка…</p>;
  }
  if (!board) {
    return <p className="text-gray-400 p-8 text-center">Доска не найдена</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="min-w-0">
          <Link href="/kanban" className="text-gray-400 hover:text-gray-600 text-sm">
            ← Все доски
          </Link>
          {editingBoardName ? (
            <input
              autoFocus
              value={boardNameInput}
              onChange={(e) => setBoardNameInput(e.target.value)}
              onBlur={() => { setEditingBoardName(false); renameBoard(boardNameInput); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { setEditingBoardName(false); renameBoard(boardNameInput); }
                if (e.key === "Escape") setEditingBoardName(false);
              }}
              className="w-full max-w-md rounded-lg border border-indigo-300 px-2 py-1 text-xl sm:text-2xl font-bold text-gray-800 mt-0.5 focus:outline-none"
            />
          ) : (
            <button
              onClick={() => { setBoardNameInput(board.name); setEditingBoardName(true); }}
              className="block text-left text-xl sm:text-2xl font-bold text-gray-800 mt-0.5 truncate hover:text-indigo-600"
              title="Переименовать доску"
            >
              {board.name}
            </button>
          )}
          {board.description && <p className="text-sm text-gray-500 mt-0.5">{board.description}</p>}
        </div>
        {user?.role === "admin" && (
        <button
          onClick={async () => {
            if (!confirm("Удалить доску целиком?")) return;
            try {
              await api.boards.delete(numId);
              router.push("/kanban");
            } catch (e) {
              alert(String(e));
            }
          }}
          className="shrink-0 text-xs text-red-400 hover:text-red-600"
        >
          Удалить доску
        </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          <SortableContext items={columns.map((c) => `col:${c.id}`)} strategy={horizontalListSortingStrategy}>
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                cards={cardsByColumn[col.id] ?? []}
                onRename={(name) => renameColumn(col.id, name)}
                onDelete={() => deleteColumn(col.id)}
                canDelete={user?.role === "admin"}
                onAddArticleCard={(article) => addArticleCard(col.id, article)}
                onUpdateCard={updateCard}
                onDeleteCard={deleteCard}
              />
            ))}
          </SortableContext>

          <AddColumnForm onAdd={addColumn} />
        </div>

        <DragOverlay>
          {activeCard ? <CardPreview card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanColumn({
  column,
  cards,
  onRename,
  onDelete,
  canDelete,
  onAddArticleCard,
  onUpdateCard,
  onDeleteCard,
}: {
  column: BoardColumn;
  cards: BoardCard[];
  onRename: (name: string) => void;
  onDelete: () => void;
  canDelete: boolean;
  onAddArticleCard: (article: ArticleSearchResult) => void;
  onUpdateCard: (cardId: number, data: { title?: string; description?: string }) => void;
  onDeleteCard: (cardId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col:${column.id}`,
    data: { type: "column", id: column.id } satisfies DragItem,
  });
  const { setNodeRef: setBodyRef } = useDroppable({
    id: `colbody:${column.id}`,
    data: { type: "columnBody", columnId: column.id } satisfies DragItem,
  });

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(column.name);
  const [addingCard, setAddingCard] = useState(false);

  function closeAddCard() {
    setAddingCard(false);
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="shrink-0 w-72 rounded-xl border border-gray-200 bg-gray-50 shadow-sm flex flex-col h-[calc(100vh-220px)]"
    >
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-gray-200">
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
          title="Перетащить колонку"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2.5" r="1.2" /><circle cx="9" cy="2.5" r="1.2" />
            <circle cx="3" cy="6" r="1.2" /><circle cx="9" cy="6" r="1.2" />
            <circle cx="3" cy="9.5" r="1.2" /><circle cx="9" cy="9.5" r="1.2" />
          </svg>
        </button>

        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => { setEditingName(false); onRename(nameInput); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setEditingName(false); onRename(nameInput); }
              if (e.key === "Escape") { setNameInput(column.name); setEditingName(false); }
            }}
            className="flex-1 min-w-0 rounded border border-indigo-300 px-1.5 py-0.5 text-sm font-semibold text-gray-800 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => { setNameInput(column.name); setEditingName(true); }}
            className="flex-1 min-w-0 text-left text-sm font-semibold text-gray-700 truncate hover:text-indigo-600"
          >
            {column.name}
          </button>
        )}

        <span className="text-xs text-gray-400 shrink-0">{cards.length}</span>
        {canDelete && (
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500 shrink-0 text-xs" title="Удалить колонку">
            ✕
          </button>
        )}
      </div>

      <div ref={setBodyRef} className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 min-h-[40px]">
        <SortableContext items={cards.map((c) => `card:${c.id}`)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onUpdate={(data) => onUpdateCard(card.id, data)}
              onDelete={() => onDeleteCard(card.id)}
            />
          ))}
        </SortableContext>
      </div>

      <div className="p-2 border-t border-gray-200">
        {addingCard ? (
          <ArticleSearchPicker
            onPick={(article) => { onAddArticleCard(article); closeAddCard(); }}
            onCancel={closeAddCard}
          />
        ) : (
          <button
            onClick={() => setAddingCard(true)}
            className="w-full text-left text-xs text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg px-2 py-1.5 transition-colors"
          >
            + Добавить статью
          </button>
        )}
      </div>
    </div>
  );
}

function ArticleSearchPicker({
  onPick,
  onCancel,
}: {
  onPick: (article: ArticleSearchResult) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArticleSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  function runSearch(q: string) {
    setLoading(true);
    api.boards.searchArticles(q).then(setResults).finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        placeholder="Поиск статьи по названию…"
        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none"
      />
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {loading && <p className="text-xs text-gray-400 px-1 py-1">Поиск…</p>}
        {!loading && results.length === 0 && (
          <p className="text-xs text-gray-400 px-1 py-1">Ничего не найдено</p>
        )}
        {!loading &&
          results.map((a) => (
            <button
              key={a.id}
              onClick={() => onPick(a)}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
            >
              <span className="text-sm text-gray-800 truncate">{a.title}</span>
              <StatusBadge status={a.status} />
            </button>
          ))}
      </div>
      <button onClick={onCancel} className="self-start text-xs text-gray-400 hover:text-gray-600">
        Отмена
      </button>
    </div>
  );
}

function KanbanCard({
  card,
  onUpdate,
  onDelete,
}: {
  card: BoardCard;
  onUpdate: (data: { title?: string; description?: string }) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card:${card.id}`,
    data: { type: "card", id: card.id, columnId: card.column_id } satisfies DragItem,
  });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function save() {
    setEditing(false);
    if (title.trim() && (title.trim() !== card.title || description.trim() !== (card.description ?? ""))) {
      onUpdate({ title: title.trim(), description: description.trim() });
    }
  }

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className="rounded-lg border border-indigo-300 bg-white shadow-sm p-2.5 flex flex-col gap-1.5">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-sm font-medium text-gray-800 border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание…"
          rows={2}
          className="w-full text-xs text-gray-600 border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-400 resize-none"
        />
        <div className="flex justify-end gap-2">
          <button onClick={() => { setTitle(card.title); setDescription(card.description ?? ""); setEditing(false); }} className="text-xs text-gray-400 hover:text-gray-600">
            Отмена
          </button>
          <button onClick={save} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
            Сохранить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group rounded-lg border border-gray-200 bg-white shadow-sm p-2.5 cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-sm text-gray-800 leading-snug flex-1 min-w-0 whitespace-pre-wrap">{card.title}</p>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {card.article_id && (
            <Link
              href={`/articles/${card.article_id}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="text-gray-700 hover:text-indigo-600"
              title="Открыть статью"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 1h4l2.5 2.5V11h-6.5V1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                <path d="M6.5 1v2.5H9" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setEditing(true)}
            className="text-gray-700 hover:text-indigo-600 text-xs"
            title="Редактировать"
          >
            ✎
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className="text-gray-700 hover:text-red-500 text-xs"
            title="Удалить"
          >
            ✕
          </button>
        </div>
      </div>
      {card.description && (
        <p className="mt-1 text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap">{card.description}</p>
      )}
      <p className="mt-1.5 text-[11px] text-gray-300">{card.created_by}</p>
    </div>
  );
}

function CardPreview({ card }: { card: BoardCard }) {
  return (
    <div className="rounded-lg border border-indigo-300 bg-white shadow-lg p-2.5 w-64 rotate-2">
      <p className="text-sm text-gray-800 leading-snug whitespace-pre-wrap">{card.title}</p>
      {card.description && <p className="mt-1 text-xs text-gray-500 line-clamp-3">{card.description}</p>}
    </div>
  );
}

function AddColumnForm({ onAdd }: { onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="shrink-0 w-72 h-11 rounded-xl border border-dashed border-gray-300 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-white transition-colors"
      >
        + Новая колонка
      </button>
    );
  }

  return (
    <div className="shrink-0 w-72 rounded-xl border border-gray-200 bg-gray-50 shadow-sm p-2.5 flex flex-col gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onAdd(name); setName(""); setAdding(false); }
          if (e.key === "Escape") { setName(""); setAdding(false); }
        }}
        placeholder="Название колонки"
        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={() => { onAdd(name); setName(""); setAdding(false); }}
          disabled={!name.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Добавить
        </button>
        <button onClick={() => { setName(""); setAdding(false); }} className="text-xs text-gray-400 hover:text-gray-600">
          Отмена
        </button>
      </div>
    </div>
  );
}
