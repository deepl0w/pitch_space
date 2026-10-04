import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * What one exercise's failure costs, bounded (ADR 0015).
 *
 * Without this, a wrong assumption anywhere under `Prompt` — or in the
 * `questionScore` a prompt's exercise is fed to — takes the whole page,
 * including the menu the user would leave by. It sits *inside* the chrome so
 * the heading and the type selector survive: a user whose scale exercise
 * throws can still switch to intervals or go back, rather than reloading.
 *
 * **It reports rather than only displaying.** Containing a crash makes it
 * quieter, and that is the real cost of this component: a throw that currently
 * stops the app is the loudest possible signal and guarantees someone finds
 * it, where one broken card among five working ones can survive a release. So
 * the seed goes on screen and the error goes to the console — generation is
 * reproducible from `(seed, settings)` (ADR 0002, ADR 0005), which makes a
 * named seed a defect someone can reproduce exactly rather than a story about
 * a blank page. There is nowhere to send a report today; when there is, what
 * it collects is a decision to make deliberately rather than inherit from here.
 */
interface Props {
  /**
   * The seed of the exercise on screen, if there is one.
   *
   * Optional because a failure can land before anything was generated, and a
   * boundary that required a seed would have to be mounted below the thing
   * most likely to throw.
   */
  seed?: number;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ExerciseBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The whole of "report" for now. Kept to one line with the seed in it so
    // a bug report can be copied out of the console rather than retyped.
    console.error(
      `Exercise failed${this.props.seed === undefined ? '' : ` (seed ${this.props.seed})`}:`,
      error,
      info.componentStack,
    );
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <section className="failure" role="alert">
        <h2>This exercise could not be shown</h2>
        <p>
          Something went wrong putting the question together, so it has been
          stopped rather than left half-drawn. The rest of the app still works —
          start the next one, or pick a different exercise above.
        </p>
        {/*
          Not decoration. The seed is the whole of the bug report: it and the
          settings regenerate this exact exercise, so quoting it turns "it
          broke" into something reproducible.
        */}
        {this.props.seed !== undefined && (
          <p className="secondary">
            Worth reporting, with this: seed {this.props.seed}.
          </p>
        )}
        <p className="secondary">{error.message}</p>
      </section>
    );
  }
}
