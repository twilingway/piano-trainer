/** Kept in tracked TypeScript; generated inference code and all model files stay git-ignored. */
export const pythonSource = String.raw`"""Local Russian speech ASR; no uploads, servers, or music-note transcription."""
import argparse
import json
import os
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parent
os.environ["HF_HOME"] = str(ROOT / "cache")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "60")


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path)
    parser.add_argument("--video")
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--model", choices=["turbo", "large-v3"], default="turbo")
    parser.add_argument("--model-only", action="store_true")
    parser.add_argument("--probe-only", action="store_true")
    args = parser.parse_args()

    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU unavailable. Install CUDA PyTorch in the local venv; CPU fallback is disabled.")
    torch_lib = Path(torch.__file__).parent / "lib"
    os.environ["PATH"] = str(torch_lib) + os.pathsep + os.environ.get("PATH", "")
    dll_handle = os.add_dll_directory(str(torch_lib)) if os.name == "nt" else None
    from faster_whisper import WhisperModel

    print(json.dumps({"gpu": torch.cuda.get_device_name(0), "model": args.model}), flush=True)
    if args.probe_only:
        return
    model = WhisperModel(args.model, device="cuda", compute_type="float16", download_root=str(ROOT / "models"))
    print("MODEL_READY", flush=True)
    if args.model_only:
        return
    if args.audio is None or args.out is None or args.video is None or args.end is None:
        parser.error("Pass prepared audio, source video, interval and output directory.")
    paths = [args.out / ("transcript." + extension) for extension in ["json", "txt", "srt"]]
    if any(path.exists() for path in paths):
        raise RuntimeError("Transcript output already exists; select another analysis ID.")

    started = time.perf_counter()
    segments, info = model.transcribe(str(args.audio), language="ru", beam_size=5, word_timestamps=True,
        vad_filter=True, condition_on_previous_text=False, hallucination_silence_threshold=1.0)
    records = []
    for segment in segments:
        record = {"start": round(segment.start + args.start, 3), "end": round(segment.end + args.start, 3),
            "text": segment.text.strip(), "words": [{"start": round(word.start + args.start, 3),
            "end": round(word.end + args.start, 3), "text": word.word, "probability": word.probability}
            for word in segment.words or []]}
        records.append(record)
        print(f"{record['start']:.2f}-{record['end']:.2f}: {record['text']}", flush=True)
    result = {"video": args.video, "sourceStart": args.start, "sourceEnd": args.end,
        "language": info.language, "model": args.model, "device": "cuda", "computeType": "float16",
        "elapsedSeconds": round(time.perf_counter() - started, 2), "segments": records}
    outputs = [json.dumps(result, ensure_ascii=False, indent=2),
        "\n".join(f"[{timestamp(r['start'])} – {timestamp(r['end'])}] {r['text']}" for r in records) + "\n",
        "\n\n".join(f"{i + 1}\n{timestamp(r['start'])} --> {timestamp(r['end'])}\n{r['text']}" for i, r in enumerate(records)) + "\n"]
    for path, content in zip(paths, outputs):
        with path.open("x", encoding="utf-8") as stream:
            stream.write(content)
    print(f"DONE {len(records)} segments in {result['elapsedSeconds']} s", flush=True)
    del dll_handle


if __name__ == "__main__":
    main()
`;
