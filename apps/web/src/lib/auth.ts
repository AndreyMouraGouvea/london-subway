import { supabase } from './supabase';

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email ou palavra-passe inválidos.';
  if (/email not confirmed/i.test(message)) return 'Confirme o email antes de entrar.';
  if (/user already registered/i.test(message)) return 'Já existe uma conta com este email.';
  if (/password should be at least/i.test(message)) {
    return 'A palavra-passe deve ter pelo menos 6 caracteres.';
  }
  if (/rate limit/i.test(message)) return 'Demasiadas tentativas. Tente novamente mais tarde.';
  return message;
}

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase Auth não está configurado.');
  }
  return supabase;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function signUpWithPassword(email: string, password: string): Promise<boolean> {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
  return Boolean(data.session);
}

export async function signOut(): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error(translateAuthError(error.message));
}
