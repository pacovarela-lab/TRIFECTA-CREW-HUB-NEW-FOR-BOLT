import {describe,expect,it} from "vitest";
import {normalizedTaskSchedule,reminderPolicy} from "../taskScheduling";
describe("task scheduling",()=>{
  it("defaults missing time to 09:00 in company timezone",()=>expect(normalizedTaskSchedule({date:"2026-11-01"})).toEqual({date:"2026-11-01",time:"09:00",durationMinutes:60,timezone:"America/New_York"}));
  it("keeps explicit local time and duration",()=>expect(normalizedTaskSchedule({date:"2026-03-08",time:"14:30",durationMinutes:90,timezone:"America/Mexico_City"}).time).toBe("14:30"));
  it("schedules one hour before",()=>expect(reminderPolicy(7_200_000,0)).toEqual({schedule:true,late:false,at:3_600_000}));
  it("uses late schedule inside one hour",()=>expect(reminderPolicy(30*60_000,0)).toEqual({schedule:true,late:true,at:0}));
  it("does not schedule inside five minutes",()=>expect(reminderPolicy(4*60_000,0)).toEqual({schedule:false,late:false}));
});
