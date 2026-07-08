# K3 Investimentos — Painel de Performance

Dashboard estático (HTML/CSS/JS puro, sem build) que lê dados ao vivo da planilha
Google Sheets publicada da K3 e exibe dois painéis: **Captação** e **KPI's**.
Sempre mostra o **mês mais recente** presente na planilha (Meta x Realizado).

Os dados são buscados diretamente do navegador (fetch client-side) via CSV
publicado do Google Sheets — não há backend nem etapa de build. Isso significa
que basta manter a planilha atualizada; o painel reflete os números automaticamente,
com atualização automática a cada 5 minutos (e a cada F5 / carregamento de página).

## Estrutura

- `index.html` — estrutura das duas abas (Captação / KPI's)
- `style.css` — tema escuro, otimizado para exibição em TV
- `app.js` — busca e parseia o CSV das 4 abas da planilha, calcula os KPIs e renderiza os gráficos (Chart.js via CDN)

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (pode ser público; **Pages grátis exige repositório público** em contas pessoais sem GitHub Pro/Team).
2. Nesta pasta (`k3-dashboard`), rode:

   ```bash
   git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPO.git
   git branch -M main
   git push -u origin main
   ```

3. No GitHub, vá em **Settings → Pages** do repositório e configure:
   - Source: `Deploy from a branch`
   - Branch: `main` / pasta `/ (root)`
4. Aguarde 1–2 minutos. O link ficará em algo como:
   `https://SEU_USUARIO.github.io/NOME_DO_REPO/`
5. Coloque esse link no navegador das TVs do escritório (pode configurar a TV/Chromecast/mini-PC para abrir esse endereço em tela cheia no login, ex.: modo quiosque do Chrome: `chrome --kiosk https://SEU_USUARIO.github.io/NOME_DO_REPO/`).

## Atualizando a planilha

Não é necessário nenhum redeploy. Assim que novas linhas do mês corrente forem
adicionadas nas abas `Consolidado`, `Metas por Assessor`, `Metas Produtos` ou
`Datas Atualização` da planilha publicada, o painel passa a refletir os novos
valores automaticamente no próximo ciclo de atualização (até 5 minutos).

Quando um novo mês começar (nova linha com `Mês` mais recente na aba
Consolidado), o painel troca sozinho para o novo mês — não precisa mexer em nada.
