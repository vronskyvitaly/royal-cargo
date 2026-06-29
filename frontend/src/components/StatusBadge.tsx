"use client";

const MAP: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Черновик",   cls: "bg-gray-100 text-gray-700" },
  approved:  { label: "Одобрено",   cls: "bg-green-100 text-green-700" },
  rejected:  { label: "Отклонено",  cls: "bg-red-100 text-red-700" },
  published: { label: "Опубликовано", cls: "bg-blue-100 text-blue-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const { label, cls } = MAP[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
