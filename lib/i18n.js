'use strict';

const STRINGS = Object.freeze({
  zh: { play: '朗读本文', pause: '暂停朗读', ready: '准备播放', playing: '正在朗读', paused: '已暂停', ended: '播放完成', failed: '播放失败', loadFailed: '音频加载失败', collapse: '收起播放器', seek: '播放进度', speed: '播放速度', speedLabel: '速度', player: '文章朗读播放器' },
  en: { play: 'Read this article', pause: 'Pause reading', ready: 'Ready to play', playing: 'Reading', paused: 'Paused', ended: 'Finished', failed: 'Playback failed', loadFailed: 'Audio could not load', collapse: 'Collapse player', seek: 'Playback progress', speed: 'Playback speed', speedLabel: 'Speed', player: 'Article audio player' },
  ja: { play: '記事を読み上げる', pause: '読み上げを一時停止', ready: '再生準備完了', playing: '読み上げ中', paused: '一時停止中', ended: '再生終了', failed: '再生に失敗しました', loadFailed: '音声を読み込めません', collapse: 'プレーヤーを閉じる', seek: '再生位置', speed: '再生速度', speedLabel: '速度', player: '記事の音声プレーヤー' },
  ko: { play: '글 읽기', pause: '읽기 일시정지', ready: '재생 준비 완료', playing: '읽는 중', paused: '일시정지', ended: '재생 완료', failed: '재생 실패', loadFailed: '오디오를 불러올 수 없음', collapse: '플레이어 접기', seek: '재생 위치', speed: '재생 속도', speedLabel: '속도', player: '글 오디오 플레이어' },
  es: { play: 'Leer este artículo', pause: 'Pausar lectura', ready: 'Listo para reproducir', playing: 'Leyendo', paused: 'En pausa', ended: 'Finalizado', failed: 'Error de reproducción', loadFailed: 'No se pudo cargar el audio', collapse: 'Contraer reproductor', seek: 'Progreso', speed: 'Velocidad de reproducción', speedLabel: 'Velocidad', player: 'Reproductor del artículo' },
  fr: { play: 'Lire cet article', pause: 'Mettre en pause', ready: 'Prêt à lire', playing: 'Lecture en cours', paused: 'En pause', ended: 'Terminé', failed: 'Échec de lecture', loadFailed: 'Chargement audio impossible', collapse: 'Réduire le lecteur', seek: 'Progression', speed: 'Vitesse de lecture', speedLabel: 'Vitesse', player: 'Lecteur audio de l’article' },
  de: { play: 'Artikel vorlesen', pause: 'Vorlesen pausieren', ready: 'Bereit', playing: 'Wird vorgelesen', paused: 'Pausiert', ended: 'Beendet', failed: 'Wiedergabe fehlgeschlagen', loadFailed: 'Audio konnte nicht geladen werden', collapse: 'Player einklappen', seek: 'Wiedergabeposition', speed: 'Wiedergabegeschwindigkeit', speedLabel: 'Tempo', player: 'Audio-Player für Artikel' },
  pt: { play: 'Ler este artigo', pause: 'Pausar leitura', ready: 'Pronto para reproduzir', playing: 'Lendo', paused: 'Pausado', ended: 'Concluído', failed: 'Falha na reprodução', loadFailed: 'Não foi possível carregar o áudio', collapse: 'Recolher player', seek: 'Progresso', speed: 'Velocidade de reprodução', speedLabel: 'Velocidade', player: 'Player de áudio do artigo' }
});

const SKIP_LABELS = Object.freeze({
  zh: { skipBack: '快退 10 秒', skipForward: '快进 10 秒' },
  en: { skipBack: 'Back 10 seconds', skipForward: 'Forward 10 seconds' },
  ja: { skipBack: '10秒戻る', skipForward: '10秒進む' },
  ko: { skipBack: '10초 뒤로', skipForward: '10초 앞으로' },
  es: { skipBack: 'Retroceder 10 segundos', skipForward: 'Avanzar 10 segundos' },
  fr: { skipBack: 'Reculer de 10 secondes', skipForward: 'Avancer de 10 secondes' },
  de: { skipBack: '10 Sekunden zurück', skipForward: '10 Sekunden vor' },
  pt: { skipBack: 'Voltar 10 segundos', skipForward: 'Avançar 10 segundos' }
});

function resolveLocale(value) {
  const input = Array.isArray(value) ? value[0] : value;
  const base = String(input || 'zh').toLowerCase().split(/[-_]/)[0];
  return STRINGS[base] ? base : 'en';
}

function labelsFor(locale) {
  const language = resolveLocale(locale);
  return { ...STRINGS[language], ...SKIP_LABELS[language] };
}

module.exports = { resolveLocale, labelsFor };
