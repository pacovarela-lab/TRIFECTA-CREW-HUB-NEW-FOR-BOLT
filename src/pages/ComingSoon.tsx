import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const ComingSoon = ({ title }: { title: string }) => {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Construction className="h-10 w-10 text-warning" />
          <p className="text-sm text-muted-foreground">Esta pantalla es parte de la próxima fase. El modelo de datos está listo — la interfaz viene después.</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/more")}>Volver</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComingSoon;
