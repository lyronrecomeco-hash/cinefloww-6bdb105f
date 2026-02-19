import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BulkImportPage = () => {
  const [status, setStatus] = useState<string>("idle");
  const [result, setResult] = useState<any>(null);

  const runImport = async () => {
    setStatus("loading");
    try {
      // Fetch the JSON file
      const resp = await fetch("/import-data.json");
      const items = await resp.json();
      
      setStatus(`Enviando ${items.length} itens...`);
      
      const { data, error } = await supabase.functions.invoke("bulk-import-links", {
        body: items,
      });

      if (error) {
        setStatus("Erro: " + error.message);
        return;
      }

      setResult(data);
      setStatus("done");
    } catch (err: any) {
      setStatus("Erro: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <h1 className="text-2xl font-bold mb-4">Importação em Massa - FilmesDaNet</h1>
      
      <button 
        onClick={runImport} 
        disabled={status === "loading" || status.startsWith("Enviando")}
        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold disabled:opacity-50"
      >
        {status === "idle" ? "Iniciar Importação" : status === "done" ? "✓ Concluído" : status}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Total no arquivo</p>
              <p className="text-2xl font-bold">{result.total_no_arquivo}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Válidos</p>
              <p className="text-2xl font-bold">{result.validos}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Já existiam</p>
              <p className="text-2xl font-bold text-yellow-500">{result.ja_existiam}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Inseridos</p>
              <p className="text-2xl font-bold text-green-500">{result.inseridos}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Falhas</p>
              <p className="text-2xl font-bold text-red-500">{result.falhas}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Sem TMDB ID</p>
              <p className="text-2xl font-bold text-muted-foreground">{result.ignorados_sem_tmdb}</p>
            </div>
          </div>

          {result.inseridos_lista?.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-2 text-green-500">✅ Inseridos ({result.inseridos})</h2>
              <div className="max-h-96 overflow-y-auto bg-card border rounded-lg p-4">
                {result.inseridos_lista.map((item: any, i: number) => (
                  <p key={i} className="text-sm py-1 border-b border-white/5">
                    {item.nome} <span className="text-muted-foreground">(TMDB: {item.tmdb_id})</span>
                  </p>
                ))}
                {result.inseridos > 50 && <p className="text-sm text-muted-foreground mt-2">...e mais {result.inseridos - 50}</p>}
              </div>
            </div>
          )}

          {result.falhas_lista?.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-2 text-red-500">❌ Falhas</h2>
              <div className="max-h-60 overflow-y-auto bg-card border rounded-lg p-4">
                {result.falhas_lista.map((item: any, i: number) => (
                  <p key={i} className="text-sm py-1 border-b border-white/5">
                    {item.nome} (TMDB: {item.tmdb_id}) - {item.error}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BulkImportPage;
