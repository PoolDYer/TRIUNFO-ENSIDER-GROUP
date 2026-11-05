import {NextResponse} from "next/server";
import {AppError,checkOrigin,requireUser} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {stockNotificationHistory} from "@/lib/stock-notifications";

export const runtime="nodejs";
function failure(error:unknown) {
  return NextResponse.json({error:error instanceof AppError?error.message:"No se pudieron cargar las notificaciones."},{status:error instanceof AppError?error.status:503});
}
export async function GET() {
  try {
    await requireUser(true);
    const data=await transaction(stockNotificationHistory);
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return failure(error);}
}
export async function POST(req:Request) {
  try {
    checkOrigin(req);await requireUser(true);
    const read=await transaction(async c=>c.query("UPDATE stock_notifications SET read_at=now() WHERE read_at IS NULL RETURNING id"));
    return NextResponse.json({ok:true,readIds:read.rows.map(row=>row.id)});
  }catch(error){return failure(error);}
}
