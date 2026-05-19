export function SkeletonCard() {
  return (
    <div className="bg-gray-800 rounded-lg p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 bg-gray-700 rounded w-32" />
        <div className="h-6 bg-gray-700 rounded-full w-16" />
      </div>
      <div className="h-4 bg-gray-700 rounded w-48" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="bg-gray-800 rounded-lg p-4 animate-pulse flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-4 bg-gray-700 rounded w-40" />
        <div className="h-3 bg-gray-700 rounded w-24" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-8 bg-gray-700 rounded" />
        <div className="h-8 w-8 bg-gray-700 rounded" />
      </div>
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-700 rounded"
          style={{ width: `${100 - (i * 15)}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonCircle() {
  return (
    <div className="w-10 h-10 bg-gray-700 rounded-full animate-pulse" />
  );
}
