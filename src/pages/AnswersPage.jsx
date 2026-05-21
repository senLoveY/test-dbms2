import Button from "../components/Button.jsx";
import { questions as sourceQuestions } from "../questions.js";

export default function AnswersPage() {
  return (
    <main className="app app-wide">
      <section className="card page-centered">
        <p className="chip">Справочник</p>
        <h1>Правильные ответы</h1>
        <p className="subtitle">
          Полный список вопросов с верными вариантами.
        </p>
        <div className="stack stack-center">
          <Button variant="primary" to="/" block>
            На главную
          </Button>
          <Button variant="secondary" to="/solo" block>
            Соло-тест
          </Button>
        </div>
      </section>

      <section className="card review">
        <div className="review-list">
          {sourceQuestions.map((question) => (
            <article className="review-item" key={question.id}>
              <div className="review-header">
                <h3>
                  {question.id}. {question.text}
                </h3>
                <span className="badge right">Верно</span>
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
