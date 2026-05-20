const questions = [
  {
    id: 1,
    type: "multiple",
    text: "Какие свойства описывают реляционную базу данных?",
    options: [
      "Хорошая горизонтальная масштабируемость",
      "Документо-ориентированная модель с индексацией данных",
      "Динамическая схема данных",
      "Строгая таблично-ориентированная модель данных",
      "Возможность вертикальной масштабируемости",
    ],
  },
  {
    id: 2,
    type: "single",
    text: "Какие компоненты обязательны при установке MS SQL Server?",
    options: [
      "SQL Server Agent, Integration Services, Database Engine",
      "Reporting Services, Replication, Database Engine",
      "SQL Server Management Tools, Database Engine, Connectivity Components",
      "Integration Services, Database Engine, Analysis Services",
      "Никакой из представленных вариантов",
    ],
  },
  {
    id: 3,
    type: "single",
    text: "Необходимо разрешить новому пользователю, впервые подключающемуся к MS SQL Server, доступ к вновь созданной базе данных с правами администратора. Выберите правильный вариант действий.",
    options: [
      "Создать логин пользователя с правами роли public, назначить пользователю полные права на схему базы данных, установить привязку пользователя к логину",
      "Создать логин пользователя в базе данных с правами администратора и назначить ему роль sysadmin",
      "Создать пользователя в базе данных и выдать ему роль DB_OWNER",
      "Создать для пользователя логин и добавить в группу Системные администраторы MS SQL Server, что автоматически выдаст необходимые привилегии в базе данных",
      "Создать пользователя в базе данных с необходимыми правами и назначить ему логин Sa аккаунта",
    ],
  },
  {
    id: 4,
    type: "single",
    text: "Какая оснастка предоставляет возможность управлять конфигурацией запуска и сетевыми настройками MS SQL Server?",
    options: [
      "MS SQL Server Agent",
      "MS SQL Server Management Studio",
      "MS SQL Server Manager Studio",
      "MS SQL Server Profiler",
      "MS SQL Server Configuration Manager",
    ],
  },
  {
    id: 5,
    type: "multiple",
    text: "Выберите средства для обеспечения высокой доступности данных, поддерживаемые MS SQL Server 2012.",
    options: [
      "Replication",
      "Database mail",
      "Mirroring",
      "Server Agent",
      "Migration",
      "Reporting",
      "Always On",
      "Log shipping",
    ],
  },
  {
    id: 6,
    type: "single",
    text: "Какая из перечисленных баз данных не может быть перемещена в другое место на диске с помощью команды ALTER DATABASE?",
    options: ["MODEL", "BACKUPS", "MASTER", "MSDB", "TEMPDB"],
  },
  {
    id: 7,
    type: "single",
    text: "Необходимо сделать план резервного копирования базы данных большого объема с активным заполнением данными. Выберите оптимальный вариант.",
    options: [
      "Полная копия в нерабочее время со сжатием + резервные копии журнала транзакций по bulk-logged модели согласно RPO",
      "Полные бэкапы в конце года + дифференциальные раз в месяц + инкрементальные журналы согласно RTO",
      "Полные копии в конце недели + дифференциальные раз в сутки + инкрементальные журналы в простой модели",
      "Полные копии в конце недели + дифференциальные для RPO/RTO + журналы только в начале и конце дня",
      "Полные, дифференциальные и журнальные бэкапы в полной модели со сжатием, периодичность согласно RPO/RTO",
    ],
  },
  {
    id: 8,
    type: "single",
    text: "Для кластеризации необходимо установить экземпляры MS SQL Server с идентичной конфигурацией на большое количество серверов. Выберите оптимальный способ.",
    options: [
      "Одновременно запускать установку из графического режима вручную на всех серверах",
      "Вручную установить все экземпляры через GUI и файл конфигурации",
      "Использовать систему управления конфигурациями для установки SQL Server и конфигурации ОС/аккаунтов",
      "Последовательная установка по списку серверов через скрипт в цикле",
      "Автоматически установить через удаленный доступ и файл скрипта",
    ],
  },
  {
    id: 9,
    type: "single",
    text: "Выберите расширения файлов, в которых хранятся активные данные баз данных MS SQL Server.",
    options: [
      "mdf, ldf, bak",
      "mdf, ldf, ndf",
      "ndf, ldf, dbo",
      "mdb, ldb, ndb",
      "mdf, ldf, sdf",
    ],
  },
  {
    id: 10,
    type: "multiple",
    text: "Выберите типы репликации, поддерживаемые MS SQL Server 2012.",
    options: [
      "Clustering",
      "Log shipping",
      "Snapshot",
      "Transactional",
      "Merge",
      "Peer-to-peer",
    ],
  },
  {
    id: 11,
    type: "multiple",
    text: "Выберите верный вариант ответа, в котором перечислены средства мониторинга и поиска неисправностей MS SQL Server.",
    options: [
      "SQL server Audit, SQL server profiler, SQL server Reporting service reports",
      "Windows Netmon, Windows Event viewer, SQL Tuning Advisor",
      "Windows Perfmon, Windows Event viewer, SQL error logs",
      "Windows Perfmon, SQL error logs, Database Engine Tuning Advisor",
      "SQL server Agent, SQL server profiler, SQL Extended events",
      "SQL server Audit, SQL server profiler, SQL Extended events",
    ],
  },
  {
    id: 12,
    type: "single",
    text: "Какой сервис MS SQL Server выполняет функцию прослушивания входящих соединений, предоставления списка установленных экземпляров и установки соединения с конкретным экземпляром?",
    options: [
      "SQL Server Browser Service",
      "SQL Server Agent Service",
      "SQL Server profiler service",
      "SQL Server Database Engine service",
      "SQL Reporting Service",
    ],
  },
  {
    id: 13,
    type: "single",
    text: "Какой вариант описания соответствует инкрементальной модели восстановления?",
    options: [
      "Разные бэкапы содержат разную информацию, их нужно восстанавливать последовательно, чтобы получить полные данные",
      "Разные бэкапы содержат одинаковый объем информации и восстанавливаются последовательно для инкрементации чекпоинтов",
      "Разные бэкапы содержат данные с момента последнего полного/дифференциального бэкапа, нужен только последний инкрементальный",
      "Все бэкапы содержат одинаковый объем информации, внутри медиасета чекпоинты инкрементируются автоматически",
      "Все бэкапы содержат одинаковую информацию, их нужно восстанавливать параллельно",
    ],
  },
  {
    id: 14,
    type: "single",
    text: "Укажите верную очередность восстановления базы данных в MS SQL Server из резервных копий.",
    options: [
      "Latest Full backup, latest differential backup, transaction log backup l..n, latest transaction log backup, tail-log backup",
      "Latest Full Copy only backup, Differential backup 1..n, latest Differential backup, Latest Transaction Log backup",
      "Latest Differential backup, Latest Transaction Log backup, latest full backup, tail-log backup",
      "Latest Transaction Log backup, latest Differential backup, latest full backup, tail-log backup",
      "Latest Full backup, latest differential backup, transaction log backup l..n, latest transaction log backup",
    ],
  },
  {
    id: 15,
    type: "multiple",
    text: "Выберите варианты с правильной строкой соединения при использовании утилиты SQLCMD.",
    options: [
      "sqlcmd -S",
      "sqlcmd -S ComputerA\\instanceB",
      "sqlcmd -S IpcComputerA\\<instancename>",
      "sqlcmd -S ComputerA1691",
      "sqlcmd -S tcp:ComputerA1433",
    ],
  },
  {
    id: 16,
    type: "single",
    text: "Какой сервис SQL Server выполняет функцию отслеживания и выполнения запланированных административных задач?",
    options: [
      "SQL Server Database Engine service",
      "SQL Reporting Service",
      "SQL Server Browser Service",
      "SQL Server Agent Service",
      "SQL Server profiler service",
    ],
  },
  {
    id: 17,
    type: "multiple",
    text: "Выберите системные базы данных, созданные при установке MS SQL Server.",
    options: ["MASTER", "RESOURCES", "MSDB", "TEMP", "BACKUPS"],
  },
  {
    id: 18,
    type: "multiple",
    text: "Выберите правильные варианты из предложенных утверждений.",
    options: [
      "Пользователь базы данных может существовать без логина на экземпляре MS SQL Server, но не может в таком состоянии взаимодействовать с БД",
      "Протокол NAMEOPIPES обеспечивает соединение базы данных через TCP/IP, в том числе через интернет",
      "Пользователи SYSADMIN роли SQL сервера имеют полномочия во всех базах данных на уровне роли db_owner",
      "Пользователь базы данных может существовать без логина, и может в таком случае соединяться с экземпляром MS SQL Server",
      "Схема базы данных служит для управления безопасностью на уровне БД",
    ],
  },
  {
    id: 19,
    type: "multiple",
    text: "Выберите варианты, где описываются свойства, присущие системным базам данных MS SQL Server.",
    options: [
      "БД, где хранятся конфигурации схем, права доступа к ресурсам сервера, временные объекты и сеансы пользователя",
      "БД, в которой хранятся настройки и описание оповещений и запланированных заданий MS SQL Server",
      "БД, которая содержит отслеживаемые пользователем события и создается при включении аудита",
      "БД, где хранятся временные объекты и которая обновляется с каждым запуском сервера",
      "БД, которая содержит системные процедуры, представления и функции и недоступна для изменений",
    ],
  },
  {
    id: 20,
    type: "single",
    text: "Как называется механизм, который используется для записи изменений транзакций в файл журнала до сохранения страниц из буфера в файл базы данных?",
    options: [
      "integration data processing",
      "extract transform logging",
      "bulk-logged",
      "point objective recovering",
      "write-ahead logging",
    ],
  },
];

const form = document.getElementById("quiz-form");
const result = document.getElementById("result");
const submitBtn = document.getElementById("submit-btn");
const resetBtn = document.getElementById("reset-btn");

function renderQuiz() {
  form.innerHTML = "";

  questions.forEach((question) => {
    const card = document.createElement("article");
    card.className = "question-card";

    const title = document.createElement("h2");
    title.className = "question-title";
    title.textContent = `${question.id}. ${question.text}`;
    card.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "question-meta";
    meta.textContent =
      question.type === "multiple"
        ? "Можно выбрать несколько вариантов"
        : "Можно выбрать один вариант";
    card.appendChild(meta);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "options";

    question.options.forEach((optionText, optionIndex) => {
      const label = document.createElement("label");
      label.className = "option";

      const input = document.createElement("input");
      input.type = question.type === "multiple" ? "checkbox" : "radio";
      input.name = `q-${question.id}`;
      input.value = String(optionIndex);

      const text = document.createElement("span");
      text.textContent = optionText;

      label.append(input, text);
      optionsWrap.appendChild(label);
    });

    card.appendChild(optionsWrap);
    form.appendChild(card);
  });
}

function collectAnswers() {
  return questions.map((question) => {
    const selected = Array.from(
      document.querySelectorAll(`input[name="q-${question.id}"]:checked`)
    ).map((element) => Number(element.value));

    return {
      id: question.id,
      selected,
    };
  });
}

function formatAnswers(answers) {
  const list = document.createElement("ul");

  answers.forEach((answer) => {
    const question = questions.find((item) => item.id === answer.id);
    const li = document.createElement("li");

    if (!question || answer.selected.length === 0) {
      li.textContent = `${answer.id}. Ответ не выбран`;
    } else {
      const selectedText = answer.selected
        .map((index) => question.options[index])
        .join("; ");
      li.textContent = `${answer.id}. ${selectedText}`;
    }

    list.appendChild(li);
  });

  return list;
}

function showResult() {
  const answers = collectAnswers();
  const notAnswered = answers.filter((answer) => answer.selected.length === 0);

  if (notAnswered.length > 0) {
    result.classList.remove("hidden");
    result.innerHTML = `<h2>Попытка не завершена</h2><p>Заполните все вопросы. Не отвечено: ${notAnswered
      .map((item) => item.id)
      .join(", ")}.</p>`;
    result.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const completedAt = new Date().toLocaleString("ru-RU");
  const savedAttempts = Number(localStorage.getItem("quizAttempts") || 0) + 1;
  localStorage.setItem("quizAttempts", String(savedAttempts));

  result.classList.remove("hidden");
  result.innerHTML = `
    <h2>Попытка завершена</h2>
    <p>Дата: ${completedAt}</p>
    <p>Количество завершенных попыток на этом устройстве: ${savedAttempts}</p>
  `;
  result.appendChild(formatAnswers(answers));
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetQuiz() {
  form.reset();
  result.classList.add("hidden");
  result.innerHTML = "";
}

submitBtn.addEventListener("click", showResult);
resetBtn.addEventListener("click", resetQuiz);

renderQuiz();
