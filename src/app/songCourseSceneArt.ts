import type { CourseMaterial } from "../songCourse/model";
import { songCourseSceneArt } from "../ui/songCourseCharacterArt";
import { decodeLessonImage } from "../ui/lessonImageDecode";

type Decode = typeof decodeLessonImage;
/** One scene generation owns its readiness; failed or exited work cannot publish presentation. */
export class SongCourseSceneArt {
  private abort = new AbortController();
  private pending: Promise<boolean> | null = null;
  constructor(
    private readonly material: CourseMaterial | null,
    readonly presentationId: string,
    private readonly decode: Decode = decodeLessonImage
  ) {}
  activate(): void {
    if (!this.abort.signal.aborted) return;
    this.abort = new AbortController();
    this.pending = null;
  }
  prepare(): Promise<boolean> {
    this.pending ??= this.load(this.material ? songCourseSceneArt(this.material) : []);
    return this.pending;
  }
  async presented(
    extraUrls: readonly string[],
    ready: () => void,
    failed: () => void
  ): Promise<void> {
    const owner = this.abort;
    const [art, engraving] = await Promise.all([this.prepare(), this.load(extraUrls)]);
    if (!owner.signal.aborted) {
      if (art && engraving) ready();
      else failed();
    }
  }
  dispose(): void {
    this.abort.abort();
  }
  private async load(urls: readonly string[]): Promise<boolean> {
    const owner = this.abort;
    try {
      const results = await Promise.all(
        [...new Set(urls)].map((url) => this.decode(url, owner.signal))
      );
      return !owner.signal.aborted && results.every(Boolean);
    } catch {
      return false;
    }
  }
}
