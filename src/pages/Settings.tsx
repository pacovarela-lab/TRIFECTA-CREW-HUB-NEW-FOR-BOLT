/* eslint-disable @typescript-eslint/no-explicit-any, no-empty */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { googleCalendarErrorMessage, googleCalendarStateErrorMessage } from "@/lib/googleCalendarErrors";
import { BusinessUnitsSettings } from "@/components/settings/BusinessUnitsSettings";
import { EmailSendAttemptsCard } from "@/components/settings/EmailSendAttemptsCard";
import { DEFAULT_REMINDER_TIME, REMINDER_MESSAGE, normalizeTime, permissionLabel } from "@/lib/dailyReminder";
import { subscribePush, unsubscribePush, requestNotificationPermission, getNotificationPermission } from "@/lib/pushSubscription";


export default function Settings(){
  const [profile,setProfile]=useState<any>(); const [country,setCountry]=useState<"US"|"MX">("US");
  const [digits,setDigits]=useState(""); const [otp,setOtp]=useState(""); const [busy,setBusy]=useState(false);
  const [calendar,setCalendar]=useState<any>(null); const [calendarLoading,setCalendarLoading]=useState(true);
  const [calendars,setCalendars]=useState<any[]>([]); const [selectedCalendar,setSelectedCalendar]=useState<string>("");
  const [reminderEnabled,setReminderEnabled]=useState<boolean>(false);
  const [reminderTime,setReminderTime]=useState<string>(DEFAULT_REMINDER_TIME);
  const [notifPermission,setNotifPermission]=useState<NotificationPermission|"unsupported">("unsupported");
  const [reminderBusy,setReminderBusy]=useState(false);
  const loadCalendars=async(calendarId?:string)=>{try{const {data,error}=await supabase.functions.invoke("google-calendar-list",{body:calendarId?{calendar_id:calendarId}:{}});if(error)throw error;if(data?.ok){setCalendars(data.calendars??[]);setSelectedCalendar(data.connection?.selected_calendar_id??"");}}catch(error){console.error("Calendar list failed",error);}};
  const saveCalendar=async(calendarId:string)=>{setSelectedCalendar(calendarId);setBusy(true);try{await loadCalendars(calendarId);toast.success("Calendario actualizado");}finally{setBusy(false);}};
  const loadCalendar=async()=>{setCalendarLoading(true);try{const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw userError;if(!user){setCalendar(null);return;}const {data,error}=await (supabase as any).from("user_calendar_connections").select("status,provider_account_email,connected_at,last_error_code,updated_at").eq("user_id",user.id).eq("provider","google").order("updated_at",{ascending:false}).limit(1).maybeSingle();if(error)throw error;setCalendar(data??null);if((data as any)?.status==="connected")void loadCalendars();}catch(error){console.error("Calendar connection status lookup failed",error);setCalendar({status:"status_unavailable"});}finally{setCalendarLoading(false);}};
  useEffect(()=>{void (async()=>{const {data:{user}}=await supabase.auth.getUser(); if(user){const {data}=await (supabase as any).from("profiles").select("*").eq("id",user.id).single();setProfile(data);setReminderEnabled(data?.daily_reminder_enabled??false);setReminderTime(data?.daily_reminder_time??DEFAULT_REMINDER_TIME);}const perm=await getNotificationPermission();setNotifPermission(perm);})();void loadCalendar();const message=googleCalendarStateErrorMessage(new URLSearchParams(window.location.search).get("calendar_error"));if(message)toast.error(message,{action:{label:"Reintentar",onClick:()=>window.history.replaceState({},"",window.location.pathname)}})},[]);

  const e164=()=>`${country==="MX"?"+52":"+1"}${digits.replace(/\D/g,"")}`;
  const invoke=async(name:string,body:unknown)=>{setBusy(true);try{const {data,error}=await supabase.functions.invoke(name,{body});if(error)throw error;return data;}finally{setBusy(false)}};
  const start=async()=>{try{await invoke("phone-verification-start",{phone:e164()});toast.success("Código enviado");setProfile({...profile,mobile_phone_e164:e164(),mobile_phone_verified_at:null});}catch{toast.error("SMS pendiente de configuración administrativa")}};
  const verify=async()=>{try{await invoke("phone-verification-check",{code:otp.replace(/\D/g,"")});toast.success("Teléfono verificado");setProfile({...profile,mobile_phone_verified_at:new Date().toISOString()});}catch(error){let detail="";try{const ctx=(error as any)?.context;if(ctx?.text){const body=JSON.parse(await ctx.text());detail=body?.detail?.status?` (${body.detail.status})`:body?.error?` (${body.error})`:"";}}catch{}toast.error(`No se pudo verificar el código${detail}. Pide un código nuevo e ingrésalo en menos de 10 minutos.`)}};
  const connect=async()=>{try{const data=await invoke("google-calendar-connect-start",{});if(data?.authorization_url) window.location.assign(data.authorization_url);else throw new Error();}catch(error){toast.error(await googleCalendarErrorMessage(error),{action:{label:"Reintentar",onClick:()=>{void connect();}}})}};
  const status=!profile?.mobile_phone_e164?"No registrado":profile.mobile_phone_verified_at?"Verificado":"Pendiente de verificación";
  return <main className="p-4 md:p-8 max-w-3xl mx-auto space-y-5"><header><h1 className="text-2xl font-bold">Perfil e integraciones</h1><p className="text-muted-foreground">Tus notificaciones son privadas y se configuran por usuario.</p></header>
    <BusinessUnitsSettings />
    <Card><CardHeader><CardTitle>Teléfono móvil</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm">Estado: <b>{status}</b></p><div className="grid grid-cols-[90px_1fr] gap-2"><select className="border rounded-md bg-background px-2" value={country} onChange={e=>setCountry(e.target.value as any)}><option value="US">🇺🇸 +1</option><option value="MX">🇲🇽 +52</option></select><Input inputMode="numeric" aria-label="Número móvil" value={digits} onChange={e=>setDigits(e.target.value.replace(/\D/g,""))} placeholder={country==="MX"?"55XXXXXXXX":"XXXXXXXXXX"}/></div><Button disabled={busy||digits.length<10} onClick={start}>Verificar teléfono</Button>{profile?.mobile_phone_e164&&!profile?.mobile_phone_verified_at&&<div className="flex gap-2"><Input aria-label="Código OTP" inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value)}/><Button onClick={verify} disabled={busy}>Confirmar código</Button></div>}<div className="flex items-center justify-between"><Label>Recibir SMS</Label><Switch checked={profile?.sms_notifications_enabled??true} onCheckedChange={async v=>{const {data:{user}}=await supabase.auth.getUser();await (supabase as any).from("profiles").update({sms_notifications_enabled:v}).eq("id",user?.id);setProfile({...profile,sms_notifications_enabled:v})}}/></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Google Calendar</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm">Estado: <b>{calendarLoading?"Verificando…":calendar?.status==="connected"?"Conectado":calendar?.status==="status_unavailable"?"No se pudo verificar":calendar?.status?"Con error":"No conectado"}</b></p>
      {calendar?.status==="connected"&&<p className="text-sm text-muted-foreground">Cuenta: {calendar.provider_account_email}{calendar.connected_at?` · desde ${new Date(calendar.connected_at).toLocaleDateString()}`:""}</p>}
      {calendar?.status==="connected"&&<div className="space-y-1">
        <Label className="text-xs">Calendario donde se crean tus tareas</Label>
        <select className="h-11 w-full rounded-md border bg-background px-2 text-sm" value={selectedCalendar??""} disabled={busy||calendars.length===0} onChange={e=>{void saveCalendar(e.target.value);}}>
          {calendars.length===0&&<option value="">{busy?"Cargando…":"Sin calendarios disponibles"}</option>}
          {calendars.map((c:any)=><option key={c.id} value={c.id}>{c.summary}{c.primary?" (principal)":""}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Las tareas asignadas a un trabajador se crean en el calendario de ese trabajador.</p>
      </div>}
      <div className="flex flex-wrap gap-2"><Button onClick={connect} disabled={busy}>{calendar?.status==="connected"?"Reconectar Google Calendar":"Conectar Google Calendar"}</Button><Button variant="outline" onClick={()=>{void loadCalendar();}} disabled={calendarLoading}>Actualizar estado</Button></div>
      {calendar?.status==="status_unavailable"&&<p className="text-xs text-destructive">No se pudo consultar el estado. Pulsa “Actualizar estado”.</p>}
      {!calendar&&<p className="text-xs text-muted-foreground">Google Calendar pendiente de configuración administrativa si el botón no puede iniciar OAuth.</p>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Recordatorio diario</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{REMINDER_MESSAGE}</p>
      <div className="flex items-center justify-between"><Label>Activar recordatorio</Label><Switch checked={reminderEnabled} onCheckedChange={async (v)=>{setReminderBusy(true);try{if(v){const perm=await requestNotificationPermission();setNotifPermission(perm);if(perm!=="granted"){toast.error("Se necesitan permisos de notificación");return;}await subscribePush();}else{await unsubscribePush();}const {data:{user}}=await supabase.auth.getUser();await (supabase as any).from("profiles").update({daily_reminder_enabled:v}).eq("id",user?.id);setReminderEnabled(v);toast.success(v?"Recordatorio activado":"Recordatorio desactivado");}finally{setReminderBusy(false);}}} disabled={reminderBusy} /></div>
      <div className="space-y-1"><Label className="text-xs">Hora del recordatorio</Label><Input type="time" className="h-11" value={reminderTime} onChange={async (e)=>{const t=normalizeTime(e.target.value);setReminderTime(t);const {data:{user}}=await supabase.auth.getUser();await (supabase as any).from("profiles").update({daily_reminder_time:t}).eq("id",user?.id);}} disabled={!reminderEnabled} /></div>
      <p className="text-xs text-muted-foreground">Permiso de notificaciones: <b>{permissionLabel(notifPermission)}</b></p>
    </CardContent></Card>

    <EmailSendAttemptsCard />
  </main>;
}

