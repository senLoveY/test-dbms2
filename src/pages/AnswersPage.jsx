import { Link } from "react-router-dom";
import { questions as sourceQuestions } from "../questions.js";

export default function AnswersPage() {
  return (
    <main className="app">
      <section className="card answers-page-header">
        <h1>Правильные ответы</h1>
        <p className="subtitle">
          Полный список вопросов с правильными вариантами ответов.
        </p>
        <Link className="primary-btn" to="/">
          На главную
        </Link>
      </section>

      <section className="card review">
        <div className="review-list">
          {sourceQuestions.map((question) => (
            <article className="review-item" key={question.id}>
              <div className="review-header">
                <h3>
                  {question.id}. {question.text}
                </h3>
              </div>

              <ul className="review-options">
                {question.options.map((option, optionIndex) => {
                  const isCorrect = question.correct.includes(optionIndex);
                  return (
                    <li
                      key={`${question.id}-${optionIndex}`}
                      className={isCorrect ? "state-right-selected" : "state-neutral"}
                    >
                      {option}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
