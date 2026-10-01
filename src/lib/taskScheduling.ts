export const DEFAULT_TASK_TIME="09:00";
export const DEFAULT_TASK_DURATION_MINUTES=60;
export function normalizedTaskSchedule(input:{date:string;time?:string|null;durationMinutes?:number|null;timezone?:string|null}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("invalid_date");
  const time=input.time?.match(/^([01]\d|2[0-3]):[0-5]\d$/)?.[0]??DEFAULT_TASK_TIME;
  const duration=input.durationMinutes&&input.durationMinutes>=5&&input.durationMinutes<=1440?input.durationMinutes:DEFAULT_TASK_DURATION_MINUTES;
  return {date:input.date,time,durationMinutes:duration,timezone:input.timezone||"America/New_York"};
}
export function reminderPolicy(startsAtMs:number,nowMs:number){const remaining=startsAtMs-nowMs;if(remaining<=5*60_000)return {schedule:false,late:false};if(remaining<60*60_000)return {schedule:true,late:true,at:nowMs};return {schedule:true,late:false,at:startsAtMs-60*60_000};}
