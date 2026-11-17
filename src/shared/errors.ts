export class ErroHttp extends Error {
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroHttp';
    this.status = status;
  }
}

export function requisicaoInvalida(mensagem: string): ErroHttp {
  return new ErroHttp(400, mensagem);
}

export function naoEncontrado(mensagem: string): ErroHttp {
  return new ErroHttp(404, mensagem);
}
