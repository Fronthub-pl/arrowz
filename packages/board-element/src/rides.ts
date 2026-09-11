// The pieces part way down their own track. A ride is a Web Animation clock
// driving `tesselatePiece` once a frame into its rider's own triangles and
// discs. The layer owns the GPU and the frame, so a ride reaches either only
// through its host.
import type { BoardData, Piece } from '@arrowz/engine'
import type { Rgba } from './gl-color.ts'
import {
  FLOATS_PER_DISC,
  frontOf,
  type PieceRanges,
  type Ride,
  rideDiscBound,
  rideVertexBound,
  tesselatePiece,
} from './tesselate.ts'
import { exitDistance, exitMs, shakeShift } from './track.ts'
import { type BoardView, SHAKE_MS } from './view.ts'

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A piece part way down its own track: its triangles and discs in cells, how
 * many of each are live, where they sit in the rider buffers, and the colour
 * they take. `data` and `discs` are allocated to `rideVertexBound(piece)` and
 * `rideDiscBound(piece)` once, at the ride's start, so a frame of a ride
 * allocates nothing.
 */
export interface Rider {
  data: Float32Array
  count: number
  /** Where its vertices begin in the rider buffer; `GlResources.uploadRiders` owns this. */
  start: number
  discs: Float32Array
  discCount: number
  /** Where its discs begin in the rider disc buffer; `GlResources.uploadRiders` owns this. */
  discStart: number
  color: Rgba
}

/**
 * What a ride needs from the layer it runs on. Uploading and scheduling are
 * two calls, not one: cancelling a ride uploads the riders that are left
 * without asking for a frame, and the layer counts the frames it draws.
 */
export interface RideHost {
  /** The board being drawn, or null before there is one. */
  board(): BoardData | null
  /** The view the board was tesselated with; read on every frame of a ride. */
  view(): BoardView
  /** Where a piece's triangles are, or null once it has ridden off for good. */
  rangesOf(id: number): PieceRanges | null
  /** Collapses a piece's triangles in the static buffer, or writes them back. */
  setStaticVisible(id: number, visible: boolean): void
  /** The colour a rider takes: the rule of the static passes, for one piece. */
  riderColor(id: number, top: boolean): Rgba
  /** Every rider's triangles into the rider buffer. */
  uploadRiders(): void
  /** Asks for a frame, coalesced with any other asked for before it. */
  schedule(): void
  /** Takes a piece off the board for good. */
  drop(id: number): void
}

export class Rides {
  private readonly host: RideHost
  /** The pieces part way down their own track, by id. */
  private readonly byId = new Map<number, Rider>()
  /** The animations of every ride in flight, by piece id. */
  private readonly running = new Map<number, Animation[]>()
  /** The animations of the exits in flight; what `isExiting` answers from. */
  private readonly exiting = new Map<number, Animation[]>()

  constructor(host: RideHost) {
    this.host = host
  }

  /** The pieces part way down their own track; read by the rider upload and the riders pass. */
  get riders(): ReadonlyMap<number, Rider> {
    return this.byId
  }

  /** True only while an exit is in flight; a piece that shakes is not leaving. */
  isExiting(id: number): boolean {
    return this.exiting.has(id)
  }

  /**
   * Rides the piece off the board head first and drops it. The head runs
   * straight out along `dir`, every other cell passes through the place of the
   * one ahead of it, and the ride is long enough for the tail to clear the
   * edge too. Resolves when the ride ends: if it finished, the piece is gone
   * for good, and if it was superseded, the piece belongs to whatever
   * superseded it.
   */
  animateExit(id: number, dir: number): Promise<void> {
    const board = this.host.board()
    const piece = this.pieceOf(id)
    if (!board || !piece) return Promise.resolve()
    // Resolved before anything is marked or cancelled: a bad `dir` throws here
    // and leaves the piece exactly as it was.
    const distance = exitDistance(piece.cells, dir, board.W, board.H)
    this.cancelRunning(id)
    const duration = reducedMotion() ? 0 : exitMs(distance)
    const { anims, done } = this.ride(id, piece, dir, duration, (p) => p * distance)
    this.exiting.set(id, anims)
    return done.then((finished) => {
      if (finished) this.host.drop(id)
    }).finally(() => {
      // Only the exit that owns the mark may clear it: a superseding exit has
      // already replaced the entry, and its piece is still on its way out.
      if (this.exiting.get(id) === anims) this.exiting.delete(id)
    })
  }

  /** Nudges the piece `distance` cells down its own track and back. */
  shake(id: number, distance: number): Promise<void> {
    const piece = this.pieceOf(id)
    if (!piece) return Promise.resolve()
    this.cancelRunning(id)
    const duration = reducedMotion() ? 0 : SHAKE_MS
    return this.ride(id, piece, piece.dir, duration, (p) => shakeShift(p, distance)).done.then(() => undefined)
  }

  /** Stops every ride in flight, each piece back where it was. */
  cancelAll(): void {
    for (const id of [...this.running.keys()]) this.cancelRunning(id)
    // A ride whose clock has settled but whose promise chain has not run yet
    // has left `running` and still holds its rider, so the loop above misses
    // it. Its piece is written back here rather than dropped: what is thrown
    // away is the rider, and the static buffer is all that would be left to
    // draw the piece.
    for (const id of [...this.byId.keys()]) this.host.setStaticVisible(id, true)
    this.byId.clear()
    this.exiting.clear()
  }

  /**
   * The piece behind an id, or null when the board never drew it or it has
   * ridden off. One scan of the pieces per ride, never per frame: the scene
   * knows where a piece's triangles are but not the cells they came from.
   */
  private pieceOf(id: number): Piece | null {
    if (!this.host.rangesOf(id)) return null
    return this.host.board()?.pieces.find((p) => p.id === id) ?? null
  }

  /**
   * Drives the piece down its own track, `shift(progress)` cells at a time,
   * and registers the ride so a later one can cancel it.
   *
   * The clock is a Web Animation over nothing at all: it gives the ride a
   * `finished` promise and a `cancel()`, so everything built on those keeps
   * working, while the drawing happens per frame. It has to, because a piece
   * on a bent track does not move as one — its line bends through the corners
   * while the head runs straight out — and no interpolated transform can do
   * that. Head, line and tail come out of one `tesselatePiece` call, so they
   * cannot drift apart.
   */
  private ride(
    id: number,
    piece: Piece,
    dir: number,
    duration: number,
    shift: (p: number) => number,
  ): { anims: Animation[]; done: Promise<boolean> } {
    const host = this.host
    const ranges = host.rangesOf(id)
    if (!ranges) return { anims: [], done: Promise.resolve(false) }
    const top = ranges.top
    const front = frontOf(piece, host.view(), top, dir)
    const bound = rideVertexBound(piece)
    const discBound = rideDiscBound(piece)
    const rider: Rider = {
      data: new Float32Array(bound * 2),
      count: 0,
      start: 0,
      discs: new Float32Array(discBound * FLOATS_PER_DISC),
      discCount: 0,
      discStart: 0,
      color: host.riderColor(id, top),
    }
    // The rider takes the piece over from here: the static buffer holds its
    // collapsed triangles until the ride is cancelled, or for good if it ends
    // anywhere but where it started.
    host.setStaticVisible(id, false)
    this.byId.set(id, rider)

    const draw = (shifted: number): void => {
      const track: Ride = { dir, front, shift: shifted }
      // `rider.data` and `rider.discs` are exactly their bounds long, and a
      // write past the end of a typed array is dropped rather than raised: the
      // bounds hold (tesselate.test.ts pins them), and if they ever stopped
      // holding, the piece would come out silently truncated instead of loudly
      // wrong. This runs inside the frame callback, so it does not reject the
      // ride's promise — it lands where an unhandled error lands, which is
      // enough to see it, and the only place the counts exist to be checked at
      // all.
      const written = tesselatePiece(piece, host.view(), top, track, rider.data, rider.discs)
      if (written.vertices > bound || written.discs > discBound) {
        throw new Error(`gl-layer: piece ${id} rode past its ${bound}-vertex or ${discBound}-disc bound`)
      }
      rider.count = written.vertices
      rider.discCount = written.discs
      host.uploadRiders()
      host.schedule()
    }

    const clock = new Animation(new KeyframeEffect(null, null, { duration, fill: 'forwards' }), document.timeline)
    const anims = [clock]
    const tick = (): void => {
      // Cancelled rides stop here; the last frame of a finished one is not
      // drawn by the loop but by `done`, so that a caller awaiting the ride
      // never sees the piece a frame short of where the ride leaves it.
      if (clock.playState !== 'running') return
      const p = clock.effect?.getComputedTiming().progress
      draw(shift(typeof p === 'number' ? p : 0))
      requestAnimationFrame(tick)
    }
    this.running.set(id, anims)
    clock.play()
    requestAnimationFrame(tick)
    const done = this.settle(id, anims).then((finished) => {
      // A superseding ride has already put this rider away and installed its
      // own; this one must touch neither it nor the piece it now owns.
      if (this.byId.get(id) !== rider) return finished
      this.byId.delete(id)
      // A ride that ends where it started is put back rather than drawn there,
      // so rounding cannot leave the piece a hair off its resting shape. One
      // that ends anywhere else leaves it collapsed, for its caller to drop.
      if (finished && shift(1) === 0) host.setStaticVisible(id, true)
      host.uploadRiders()
      host.schedule()
      return finished
    })
    return { anims, done }
  }

  /** Resolves true when every animation finished, false when one was cancelled. */
  private settle(id: number, anims: Animation[]): Promise<boolean> {
    return Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (this.running.get(id) === anims) this.running.delete(id)
        return true
      },
      () => false,
    )
  }

  /**
   * Stops the ride of a piece and writes its triangles back into the static
   * buffer at once. Here and not in the cancelled ride's own settling, which
   * cannot know whether the piece is wanted back: a superseding ride collapses
   * it again on the very next line, while a `setBoard` or a `dispose` has no
   * next ride to draw it, and the piece would be gone from the board for as
   * long as it stayed.
   */
  private cancelRunning(id: number): void {
    const anims = this.running.get(id)
    this.running.delete(id)
    if (anims) { for (const a of anims) a.cancel() }
    if (this.byId.delete(id)) this.host.uploadRiders()
    this.host.setStaticVisible(id, true)
  }
}
