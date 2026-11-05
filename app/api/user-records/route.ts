import {NextResponse} from "next/server";
import {z} from "zod";
import {requireUser,AppError} from "@/lib/auth";
import {transaction} from "@/lib/db";
import {previewUserRecords} from "@/lib/user-records";
export const runtime="nodejs";
export async function GET(req:Request){
  try{
    await requireUser(true);
    const id=z.string().uuid().parse(new URL(req.url).searchParams.get("userId"));
    const result=await transaction(async c=>{
      await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      return previewUserRecords(c,id);
    });
    return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return NextResponse.json({error:error instanceof AppError?error.message:error instanceof z.ZodError?"Administrador inválido.":"No se pudo revisar los registros del administrador."},
      {status:error instanceof AppError?error.status:error instanceof z.ZodError?400:503});
  }
}
