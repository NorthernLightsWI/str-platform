import { redirect } from "next/navigation"

export default function MaintenanceRedirect() {
  redirect("/operations/maintenance")
}
