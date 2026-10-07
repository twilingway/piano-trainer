# Развёртывание Piano Trainer

Публичный адрес: `https://keys.twiling.ru/`. Прежний `https://piano.twiling.ru/` отдаёт тот же релиз
без редиректа: данные игроков в `localStorage` привязаны к его origin. Сайт — статическая сборка
Vite в контейнере `piano-web`. Nginx Proxy Manager (NPM) и контейнер находятся в общей Docker-сети
`public_net`; контейнер не публикует порт Mac наружу.

## Один раз на Mac mini

DNS-записи `keys.twiling.ru` и `piano.twiling.ru` типа A должны указывать на тот же публичный адрес,
что и `space.twiling.ru`. На роутере к NPM направлены только 80/443; SSH остаётся в локальной сети.

```bash
mkdir -p ~/piano-prod/state
git clone https://github.com/twilingway/piano-trainer.git ~/piano-prod/repo
cp ~/piano-prod/repo/.env.production.example ~/piano-prod/.env.production
chmod 600 ~/piano-prod/.env.production
docker network inspect public_net
```

Если сеть называется иначе, измените `PROXY_NETWORK` в `~/piano-prod/.env.production`. Каталог
`~/piano-prod` отдельный от Towerdefander. Пользователь Mac должен иметь доступ к Docker, Git, Bash,
Node и curl. При Docker Desktop или Colima runtime должен запускаться после входа этого
пользователя.

После вливания PR в `main` дождитесь зелёной проверки `CI / gate`. Первый старт можно выполнить до
настройки NPM. Режим `--local-only` доступен только до первого записанного релиза:

```bash
~/piano-prod/repo/scripts/deploy-production.sh --local-only
docker-compose --project-name piano --env-file ~/piano-prod/.env.production \
  -f ~/piano-prod/repo/docker-compose.prod.yml ps
```

Локальный старт не записывает релиз в историю. В NPM по адресу `http://192.168.1.163:81/` создайте
Proxy Host: домены `keys.twiling.ru` и `piano.twiling.ru`, схема `http`, Forward Hostname
`piano-web`, порт `80`. Включите Let's Encrypt и Force SSL. WebSockets Support не требуется.
Убедитесь, что контейнер NPM подключён к `public_net`; существующие хосты Towerdefander менять не
надо.

После выпуска сертификата завершите релиз и включите агент:

```bash
~/piano-prod/repo/scripts/deploy-production.sh
cp ~/piano-prod/repo/deploy/com.twiling.piano-deploy.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.twiling.piano-deploy.plist
launchctl print gui/$(id -u)/com.twiling.piano-deploy
```

Агент раз в минуту спрашивает SHA `main`; статус CI одного SHA проверяет не чаще раза в пять минут.
При недоступном GitHub, красном или незавершённом CI текущая версия остаётся работающей. Сценарии
статуса CI проверяются командой `bash scripts/check-ci.test.sh`. Новый образ собирается на Mac,
после запуска проверяются `/health`, публичный маркер версии, стартовая страница и её ассеты. При
ошибке возвращается предыдущий образ. Три последних образа хранятся в истории.

## Проверка

```bash
curl -I http://keys.twiling.ru/
curl -I https://keys.twiling.ru/
curl -fsS https://keys.twiling.ru/version.txt
curl -fsS https://piano.twiling.ru/version.txt
cat ~/piano-prod/state/deployed-sha
tail -n 50 ~/piano-prod/state/deploy.log
```

Первый запрос должен перенаправляться на HTTPS. Версия с сайта должна совпадать с `deployed-sha`. В
Chrome или Edge проверьте загрузку интерфейса и звука, запрос разрешения Web MIDI, работу с
клавиатурой и сохранность песни/дубля после перезагрузки. Сэмплы фортепиано и шрифты загружаются
браузером с внешних адресов, поэтому проверяйте их отдельно в сети пользователя. Скрытая вкладка
браузера не подтверждает работу анимации и воспроизведения.

## Откат и диагностика

```bash
cat ~/piano-prod/state/tag-history
tail -n 100 ~/piano-prod/state/agent.log
tail -n 100 ~/piano-prod/state/deploy.log
```

Скрипт выпуска после каждой сборки удаляет её промежуточные контейнеры и слои (метка
`com.twiling.app=piano-trainer`), а после релиза запускает `fstrim` в VM Colima: диск VM растёт на
хосте и отдаёт освобождённое место только после trim. Если сайт отдаёт 500 на любые файлы при живом
`/health`, сначала проверьте место:

```bash
df -h /System/Volumes/Data
du -sh ~/.colima/_lima/_disks/colima
docker system df
```

Для ручного отката возьмите предыдущий тег из `tag-history` и запустите сохранённый образ:

```bash
cd ~/piano-prod/repo
IMAGE_TAG=<предыдущий-тег> docker-compose --project-name piano \
  --env-file ~/piano-prod/.env.production -f docker-compose.prod.yml \
  up -d --no-build piano-web
```

Это временный откат: агент увидит расхождение с последним SHA `main` только если `deployed-sha`
также изменён. Для постоянного отката верните исправление через PR в `dev`, затем PR из `dev` в
`main`, и дождитесь CI. Настройки и песни на стороне браузера контейнер не затрагивает.
