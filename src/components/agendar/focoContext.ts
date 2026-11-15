import { createContext } from 'react'

// Diz ao PassoLayout se o foco deve ir para o título do passo.
// false na primeira carga da página (não "sequestra" o foco de quem acabou de chegar);
// true depois que a pessoa troca de passo (leitor de tela anuncia o novo passo).
export const FocarTituloContext = createContext(false)
