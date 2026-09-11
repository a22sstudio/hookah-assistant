import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const results: Record<string, unknown> = {}
  
  // Проверяем каждую модель
  try {
    results.tobacco = await db.tobacco.count()
  } catch (e) { results.tobacco = 'ERROR: ' + (e as Error).message }
  
  try {
    results.master = await db.master.count()
  } catch (e) { results.master = 'ERROR: ' + (e as Error).message }
  
  try {
    results.notification = await db.notification.count()
  } catch (e) { results.notification = 'ERROR: ' + (e as Error).message }
  
  try {
    results.scheduleEntry = await db.scheduleEntry.count()
  } catch (e) { results.scheduleEntry = 'ERROR: ' + (e as Error).message }
  
  try {
    results.dailySummary = await db.dailySummary.count()
  } catch (e) { results.dailySummary = 'ERROR: ' + (e as Error).message }
  
  return NextResponse.json(results)
}
