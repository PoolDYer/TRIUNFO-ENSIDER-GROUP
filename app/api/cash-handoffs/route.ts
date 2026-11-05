import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser,AppError} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {cashHandoffReport} from "@/lib/cash-handoffs";
export const runtime="nodejs";
export async function GET(req:Request){
  try{
    await requireUser();
    const page=z.coerce.number().int().min(1).max(1000000).parse(new URL(req.url).searchParams.get("page")??1);
    const result=await transaction(async c=>{
      await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      return cashHandoffReport(c,page);
    });
    return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return NextResponse.json({error:error instanceof AppError?error.message:error instanceof z.ZodError?"Página de historial inválida.":"No se pudieron cargar los movimientos de la caja."},
      {status:error instanceof AppError?error.status:error instanceof z.ZodError?400:503});
  }
}
