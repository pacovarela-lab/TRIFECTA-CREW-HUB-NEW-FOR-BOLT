import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export class GlobalErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){ return {failed:true}; }
  componentDidCatch(error:Error, info:ErrorInfo){
    const msg = `${error.name}: ${error.message}\n${info.componentStack?.slice(0,500) ?? ""}`;
    console.error("[ui-boundary]", msg);
    try {
      const key = "crewhub_last_error";
      const entry = JSON.stringify({ t: Date.now(), msg: msg.slice(0, 1000) });
      sessionStorage.setItem(key, entry);
    } catch {}
  }
  render(){
    if(this.state.failed) return <main className="min-h-screen grid place-items-center p-6 bg-background"><section className="max-w-md text-center space-y-4"><h1 className="text-xl font-semibold">No pudimos cargar esta sección.</h1><p className="text-muted-foreground">Tu información no se perdió. Intenta cargarla nuevamente.</p><div className="flex flex-col gap-2 sm:flex-row sm:justify-center"><Button onClick={()=>{this.setState({failed:false});window.location.reload();}}>Reintentar</Button><Button variant="outline" onClick={()=>{window.location.href="/more?feedback=1";}}>Reportar este problema</Button></div></section></main>;
    return this.props.children;
  }
}
