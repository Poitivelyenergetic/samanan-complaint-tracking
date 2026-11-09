import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ApiAuthError, requirePermission } from "@/lib/api-auth";
import type { OrderDuplicate } from "@/lib/types";

// Earlier complaints on a customer order number, for New Complaint's
// "this order already has a complaint" warning. Anyone who can file a
// complaint can ask, even if their role can't read other people's
// complaints — so only the basics come back (number, status, type, who has
// it, when), plus whether they're allowed to open each one.
export async function POST(request: Request) {
  try {
    const uid = await requirePermission(request, "complaints", "create");
    const body = await request.json().catch(() => null);
    const value = typeof body?.orderNumber === "string" ? body.orderNumber.trim().slice(0, 100) : "";
    if (!value) return NextResponse.json({ complaints: [] });

    // The same number typed with Arabic-Indic or Eastern Arabic-Indic digits
    // counts too (older complaints kept whatever was typed).
    const spell = (zero: number) => value.replace(/[0-9]/g, (d: string) => String.fromCharCode(zero + Number(d)));
    const spellings = [...new Set([value, spell(0x0660), spell(0x06f0)])];

    const db = getAdminDb();
    const [snap, me] = await Promise.all([
      db.collection("complaints").where("customerOrderNumber", "in", spellings).get(),
      db.collection("users").doc(uid).get(),
    ]);
    const perms = me.data()?.permissions?.complaints ?? {};

    const assigneeIds = [...new Set(snap.docs.map((d) => d.data().assignedTo).filter((id): id is string => typeof id === "string" && !!id))];
    const assignees = new Map<string, { nameAr: string; nameEn: string }>();
    await Promise.all(
      assigneeIds.map(async (id) => {
        const u = await db.collection("users").doc(id).get();
        if (u.exists) assignees.set(id, { nameAr: u.data()?.nameAr ?? "", nameEn: u.data()?.nameEn ?? "" });
      })
    );

    const complaints: OrderDuplicate[] = snap.docs
      .map((d) => {
        const c = d.data();
        const createdAt = c.createdAt instanceof Timestamp ? c.createdAt.toDate().toISOString() : new Date(0).toISOString();
        // The same rule Firestore uses for reading a complaint (canReadComplaint).
        const canOpen =
          perms.viewAll === true ||
          (perms.view === true &&
            (c.assignedTo === uid || (Array.isArray(c.everAssignedTo) && c.everAssignedTo.includes(uid)) || c.createdBy === uid));
        return {
          id: d.id,
          status: c.status,
          complaintTypeId: c.complaintTypeId ?? "",
          assignee: typeof c.assignedTo === "string" && c.assignedTo ? (assignees.get(c.assignedTo) ?? null) : null,
          createdAt,
          canOpen,
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return NextResponse.json({ complaints });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
