// Reads use GET requests: unlike mutation actions, independent widgets can run concurrently.
async function readDashboard(widget: string, businessId: string, month?: string) {
  const params = new URLSearchParams({ widget, businessId });
  if (month) params.set("month", month);
  const response = await fetch(`/api/dashboard?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Dashboard ${widget}: ${response.status}`);
  return response.json();
}
export const getDashboardStats = (businessId: string) => readDashboard("stats", businessId);
export const getDashboardToday = (businessId: string) => readDashboard("today", businessId);
export const getDashboardUpcoming = (businessId: string) => readDashboard("upcoming", businessId);
export const getDashboardCalendarMonth = (businessId: string, month?: string) => readDashboard("calendar", businessId, month);
