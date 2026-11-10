import { Link } from 'react-router-dom';
import { ArrowLeft, MapPinOff } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center p-6 py-24">
        <div className="panel w-full">
          <EmptyState
            icon={<MapPinOff className="h-5 w-5" />}
            title="Página não encontrada"
            description="O endereço não corresponde a nenhuma vista do digital twin."
            action={
              <Link
                to="/"
                className="mt-1 inline-flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-xs text-accent transition hover:bg-accent/15"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar ao CCO
              </Link>
            }
          />
        </div>
      </div>
    </div>
  );
}
