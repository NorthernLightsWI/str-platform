export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" style={{ background: "#0A0D10" }}>
      <div
        className="h-8 w-48 rounded-lg animate-pulse"
        style={{ background: "#181b20" }}
      />
      <div
        className="h-64 w-full rounded-xl animate-pulse"
        style={{ background: "#181b20" }}
      />
      <div
        className="h-48 w-full rounded-xl animate-pulse"
        style={{ background: "#181b20" }}
      />
    </div>
  )
}
