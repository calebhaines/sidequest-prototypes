const research =
  "https://github.com/calebhaines/PAFS-LM/blob/2f393e3ac01f67b48929a3d8462ff61bb17c650e/";
const source = (label, path) => ({ label, url: research + path });
const perception = () =>
  source(
    "Planned multilayer emotion/intensity study",
    "docs/studies/multilayer_emotion_intensity_v1.md",
  );
const proposal = () =>
  source("Original PAFS-LM proposal", "PAFS_LM_Research_Proposal.md");
const memoryReport = () =>
  source(
    "Matched-time text-memory results",
    "docs/results/2026-10-17-text-memory-compute/README.md",
  );

// All interactive laboratory values are teaching examples, not project measurements.
export const lessons = [
  {
    id: "foundations",
    title: "Parameters, activations and state",
    eyebrow: "01 · Model components",
    minutes: 8,
    lab: "training",
    summary:
      "Learned parameters, temporary activations, input context and external memory.",
    sections: [
      {
        title: "Models and parameters",
        body: `<p>A machine-learning model is a function with adjustable numerical settings called <strong>parameters</strong>. It takes an input and produces a prediction. A tiny model might predict a house price from its size; a language model predicts the next token from the tokens available so far. Training adjusts parameters so predictions improve on examples.</p><p>A sound mixer provides an analogy: training changes the positions of its controls, while running a song through it produces changing signals. The controls represent lasting settings; the signals represent temporary activity. Individual parameters need not have an interpretable human meaning.</p>`,
      },
      {
        title: "Parameters, activations, context and external state",
        body: `<p><strong>Parameters</strong> are the learned settings. <strong>Activations</strong> are temporary numerical signals computed for the current input. <strong>Context</strong> is the sequence of tokens supplied to the model. <strong>External state</strong> is information stored by surrounding software, such as a table of facts or an emotion-like value.</p><p>These can interact without being interchangeable. Putting a reminder in the prompt changes context. Adding a vector to a hidden layer changes activations. Updating LoRA weights changes parameters. Keeping a sadness value between requests changes external state. Ask which of these changed whenever a result says the model “remembered” or “adapted.”</p>`,
      },
      {
        title: "Inference and training",
        body: `<p><strong>Inference</strong> means running a model to obtain outputs. Its weights usually stay fixed. <strong>Training</strong> uses a loss—a numerical measure of error—to update selected weights. During inference the output can change dramatically because the input changes; that alone is not a new learned skill.</p><p>A pretrained model has already learned from a large collection of text. Your project begins with those existing abilities, rather than teaching language from scratch. <strong>Frozen</strong> means its parameters are held fixed in a particular experiment. A frozen model can still produce different activations and answers for every new input.</p>`,
      },
      {
        title: "The four PAFS-LM components",
        body: `<p>PAFS-LM proposes a perception network that reads activations, a controller that keeps an external state, a modulation network that changes activations, and a language model that may learn to work with that apparatus. Each component needs its own evidence. A good detector does not establish a good controller; a correctly decaying state does not establish better decisions.</p><p>The training lab uses invented numbers to demonstrate predictions, error and weight updates. Before interpreting an accuracy score, specify <strong>what is trained, what is frozen, what information is supplied, and what success would mean</strong> for the experiment.</p><p>Learning can happen in the small predictor, the modulation network, or the language model. A report should identify each trainable component instead of treating the whole system as one learner.</p>`,
      },
    ],
    takeaway:
      "A changed answer can come from changed input, changed activity, changed external state, or changed weights. Only the last necessarily involves parameter learning.",
    quiz: {
      question:
        "A program adds yesterday’s summary to today’s prompt while keeping all weights fixed. What changed?",
      options: [
        "The model parameters",
        "The context supplied during inference",
        "The model has necessarily learned a lasting new skill",
      ],
      correct: 1,
      explanation:
        "The summary changes the input context. It can improve performance without updating any parameters or leaving a skill after the summary is removed.",
    },
    sources: [
      proposal(),
      {
        label: "Google: machine-learning foundations",
        url: "https://developers.google.com/machine-learning/crash-course",
      },
    ],
  },
  {
    id: "language-models",
    title: "Tokens, transformers and generation",
    eyebrow: "02 · Language models",
    minutes: 9,
    lab: "tokens",
    summary:
      "Text processing through tokenization, embeddings, transformer blocks and output probabilities.",
    sections: [
      {
        title: "Tokens and embeddings",
        body: `<p>A <strong>tokenizer</strong> breaks text into vocabulary items called tokens. A token may be a word, part of a word, punctuation, or a space combined with text. “One word” and “one token” are different units. Exact tokenization depends on the model.</p><p>Each token ID becomes a numerical vector through an <strong>embedding</strong> lookup. The transformer then repeatedly transforms these vectors. Position information helps distinguish “A follows B” from “B follows A.” The context window limits how much token history the model can process at once; storing information outside that window does not automatically make it accessible inside the model.</p>`,
      },
      {
        title: "Attention and the residual stream",
        body: `<p>A transformer block contains <strong>attention</strong> and a feed-forward network. Attention lets a token’s representation draw on relevant earlier tokens. In a causal language model, a position cannot attend to future tokens. Repeating blocks builds richer representations from the same input sequence.</p><p>The <strong>residual stream</strong> is the running vector representation that blocks read and update. A shared document undergoing successive revisions provides an analogy for this information flow. It does not establish human-like reasoning steps. When PAFS-LM records or changes a layer’s activations, it accesses one stage of this computation.</p>`,
      },
      {
        title: "Logits, softmax and temperature",
        body: `<p>The final representation is converted into a score for each vocabulary token. These raw scores are <strong>logits</strong>. A softmax converts them into probabilities that sum to one. Raising a token’s logit relative to alternatives raises its probability.</p><p><strong>Temperature</strong> controls how concentrated the sampling distribution is: lower positive temperatures concentrate probability on high-scoring tokens; higher temperatures spread it out. Greedy decoding chooses the highest-scoring token without sampling. A model may assign a better probability to the correct action without changing its greedy answer. Therefore probability improvement and action improvement deserve separate reporting.</p>`,
      },
      {
        title: "Restricted choices and native output validity",
        body: `<p>Suppose the full vocabulary assigns 10% probability to A, 5% to B, and 85% to other tokens. If evaluation considers only A and B and renormalizes, A receives 67%. That is a <strong>conditional</strong> probability among allowed actions. It does not mean the model would normally output A.</p><p>The project’s small decision experiments therefore need both restricted-action scores and <strong>native output validity</strong>: does the unrestricted model actually choose an allowed answer? Check wording, answer order, tokenization, sampling and parsing rules before interpreting differences. The token lab uses an invented small vocabulary; Qwen has a much larger vocabulary.</p><p>Generation repeats this process after each new token. One early formatting choice can change the context and influence every later token, including the final answer.</p>`,
      },
    ],
    takeaway:
      "Normal model output, restricted-action probabilities and sampled actions measure different aspects of performance. Report them separately.",
    quiz: {
      question:
        "A model gives A 10%, B 5%, and other tokens 85%. Is it ready to reliably answer an A/B task normally?",
      options: [
        "Yes, because A beats B",
        "No; most probability still goes to invalid outputs",
        "Yes, because conditional accuracy proves native validity",
      ],
      correct: 1,
      explanation:
        "A wins the forced A/B comparison, but normal generation strongly favors other outputs. Conditional scoring and unrestricted validity measure different properties.",
    },
    sources: [
      source(
        "Original internal-signal RL experiment",
        "docs/results/2026-10-17-rl-signal/README.md",
      ),
      {
        label: "Hugging Face: language-model generation",
        url: "https://huggingface.co/docs/transformers/main/en/llm_tutorial",
      },
    ],
  },
  {
    id: "activations",
    title: "Activation capture and steering",
    eyebrow: "03 · Internal representations",
    minutes: 8,
    lab: "activations",
    summary:
      "Hidden vectors, layer selection, pooling and the distinction between detection and causal control.",
    sections: [
      {
        title: "Hidden vectors and distributed information",
        body: `<p>At each layer, each token has a hidden vector: a list of numbers describing its current representation. In the project’s Qwen3-4B configuration, the hidden width is 2,560. That means one token representation has 2,560 coordinates, not 2,560 independently named concepts.</p><p>Information is often <strong>distributed</strong>: a useful concept may be readable from a pattern across many coordinates. Different concepts can overlap. Recording a vector is like taking a measurement of the running computation. It does not provide a literal transcript of the model’s thoughts or a direct measurement of a human-style emotion.</p>`,
      },
      {
        title: "Layer selection and pooling",
        body: `<p>A model supplies many possible observations: different layers, different tokens, before or after different operations. The planned perception study begins with zero-based layers 8, 12, 16, 20, 24 and 28. “Layer 24” therefore means the twenty-fifth block.</p><p><strong>Pooling</strong> reduces token-level measurements to a representation for the passage. Last-nonpadding-token pooling takes the final real token’s vector. Mean pooling averages chosen token vectors. Neither is universally best. Hold the rule fixed initially so changing layers does not also change the measurement method. Padding tokens should not accidentally become the passage representation.</p>`,
      },
      {
        title: "Capture hooks and steering hooks",
        body: `<p>A capture hook reads a hidden vector without deliberately changing it. A steering hook adds an intervention, often written <code>h′ = h + αv</code>: the original activity plus a chosen direction scaled by a strength. The direction, strength, token positions and injection layer all matter.</p><p>A direction that predicts sadness may capture language associated with sad situations rather than a mechanism that controls decisions. Adding it can change style, answer format, unrelated abilities, or nothing measurable. Demonstrating causality requires applying the intervention and comparing outcomes with appropriate controls; a classifier’s accuracy cannot supply that evidence by itself.</p>`,
      },
      {
        title: "Intervention strength and control conditions",
        body: `<p>A weak intervention may be too small to change the winning action. A strong intervention can move activity into patterns the model handles poorly. There may be no useful strength for a particular direction. Useful steering needs both a task effect and acceptable preservation of ordinary abilities.</p><p>Compare the intervention with zero strength, removal, and multiple random directions of comparable magnitude. Use fresh contexts when testing reversal: old cached computations can preserve effects after a hook is removed. In the activation lab, changing the input or layer changes a synthetic pattern. The displayed values are teaching examples rather than Qwen measurements.</p><p>Capture unsteered readouts when possible. If steering also changes the detector’s inputs, the controller may respond to its own intervention rather than a new external event.</p>`,
      },
    ],
    takeaway:
      "An activation is a measurement. A steering vector is an intervention. Predictive information and causal influence require different experiments.",
    quiz: {
      question:
        "A direction accurately separates sad from neutral passages. What follows?",
      options: [
        "Adding it must make decisions sadder",
        "It contains predictive information; causal control still needs testing",
        "Its coordinates measure subjective sadness",
      ],
      correct: 1,
      explanation:
        "Separation establishes decodability in the tested data. It does not establish a causal mechanism, useful control, or subjective feeling.",
    },
    sources: [
      perception(),
      source(
        "Minimum persistent-state intervention",
        "docs/results/2026-10-16-minimum-affect/README.md",
      ),
    ],
  },
  {
    id: "probes",
    title: "Linear and nonlinear probes",
    eyebrow: "04 · Probes and embeddings",
    minutes: 9,
    lab: "probes",
    summary:
      "Predictors that read frozen representations, combine layers and learn compact embeddings.",
    sections: [
      {
        title: "Linear probes",
        body: `<p>A <strong>probe</strong> is a trained predictor that uses a model’s internal representations as inputs. The large model can stay frozen while a much smaller predictor learns to associate recorded vectors with labels. Recording points are the sensors; the trained readout is the probe.</p><p>A linear probe forms weighted sums of the input coordinates, then converts those scores into predictions. It is relatively simple and useful as a baseline. Good performance means the selected representations contain information a simple reader can extract on the evaluation distribution. It does not show that the main model itself uses that information to choose its behavior.</p>`,
      },
      {
        title: "Nonlinear probes and shared embeddings",
        body: `<p>A multilayer perceptron, or <strong>MLP</strong>, adds nonlinear transformations. It can combine signals that a single linear boundary cannot separate. For the proposed study, selected layers feed a small network that creates a shared 64-number embedding, followed by separate prediction heads for emotions.</p><p>This embedding is learned to help the prediction task. Its first coordinate need not mean sadness, and its second need not mean anger. Different training runs may organize equivalent information differently. More expressive readers may improve accuracy, but can also memorize dataset quirks. Small size alone does not prevent overfitting.</p>`,
      },
      {
        title: "Multilayer and nonlinear comparisons",
        body: `<p>Use three comparisons: a single-layer linear reader, a multilayer linear reader, and a multilayer nonlinear reader. The second versus the first tests additional observations. The third versus the second tests whether nonlinearity helps with the same observations. Choosing the best single layer belongs on development data.</p><p>Normalize features using training data only. Otherwise the held-out data influences the fitted pipeline. Keep examples, labels and information about the person identical across methods. Direct Qwen classification provides another comparison. A probe that beats a weak keyword classifier has not thereby beaten Qwen’s own prompted answers.</p>`,
      },
      {
        title: "Capture cost and generalization",
        body: `<p>The reader may have few trainable parameters, but obtaining its inputs still requires running Qwen. Report capture cost as well as predictor cost. For a frozen model, activations can often be cached once and reused across small-reader experiments.</p><p>Test unfamiliar stories rather than random near-duplicates. Include implicit emotion, quotation and different characters. If a detector succeeds only when obvious emotion words appear, its aggregate score may not reflect performance on the inputs the controller will receive. The probe lab uses synthetic geometry to compare linear and nonlinear boundaries. It does not measure the project’s representations.</p><p>Check learning curves against dataset size. If a sophisticated reader improves only on training data, its added flexibility has not supplied the desired generalization benefit.</p>`,
      },
    ],
    takeaway:
      "Compare one layer with several, then linear with nonlinear prediction on the same inputs. These comparisons separate additional features from additional predictor flexibility.",
    quiz: {
      question: "Which comparison isolates the value of nonlinear prediction?",
      options: [
        "Single-layer linear versus multilayer nonlinear",
        "Multilayer linear versus multilayer nonlinear on the same features",
        "A probe versus a model receiving no information",
      ],
      correct: 1,
      explanation:
        "Keeping the input features fixed isolates the added nonlinear reader. Changing layers and architecture together confounds the two changes.",
    },
    sources: [
      perception(),
      {
        label: "Probing classifier methodology",
        url: "https://arxiv.org/abs/1805.01070",
      },
    ],
  },
  {
    id: "emotion-intensity",
    title: "Emotion presence and intensity",
    eyebrow: "05 · Emotion measurement",
    minutes: 10,
    lab: "emotion",
    summary:
      "Absent, low, medium and high predictions, with explicit experiencers and human-rated intensity labels.",
    sections: [
      {
        title: "Experiencers and multiple emotions",
        body: `<p>“Maya celebrated while Sam stared at the rejection letter” contains more than one person and potentially more than one emotion. A label must specify the <strong>experiencer</strong>: the writer, Maya, Sam, or another declared target. Otherwise disagreement may reflect different questions rather than poor annotation.</p><p>Predict each emotion separately so high sadness can coexist with low relief. This is a multilabel task. The planned outputs use four ordered levels per emotion: 0 absent, 1 low, 2 medium, 3 high. These are practical rating categories. The numbers do not make emotion a physical quantity with proven equally spaced units.</p>`,
      },
      {
        title: "Confidence and intensity",
        body: `<p>Consider “I am a little disappointed.” It may clearly express weak sadness. A detector could be very certain that the correct level is low. Conversely, an ambiguous passage might suggest either absent or high sadness. Uncertainty about the category is different from moderate strength.</p><p>Keep a probability distribution across all four levels for each emotion. Presence confidence is <code>1 − P(absent)</code>. The predicted intensity can be a declared summary of that distribution; for absolute-error scoring, the proposed study uses its median level. Preserve the distribution rather than converting every uncertain case into “medium.”</p>`,
      },
      {
        title: "Intensity annotations and missing labels",
        body: `<p>An emotion label alone does not provide an intensity label. Human ratings need anchored definitions and examples for low, medium and high. Preserve disagreement when available. If a dataset uses another scale, justify and freeze the mapping before examining test results.</p><p><strong>Unknown is not absent.</strong> If a person rated sadness only, unmentioned anger may simply be unrated. A mask excludes unsupported targets from the relevant loss and metric. A known-present emotion with unknown strength can support presence learning without supplying a low/medium/high target. Model-generated ratings may be useful research material, but should not be presented as independent human ground truth.</p>`,
      },
      {
        title: "Ordinal prediction and evaluation",
        body: `<p>Ordinal learning respects the ordering: high versus medium is a smaller disagreement than high versus absent. One implementation predicts the cumulative events “at least low,” “at least medium,” and “high,” while ensuring ordered probabilities. The final outputs must form a valid distribution.</p><p>Report intensity errors and presence performance separately, including errors among emotions annotated present. Otherwise abundant absent labels can dominate the score. Examine per-emotion confusion matrices and calibration. Accurate recognition of a person’s described sadness would support the perception component; it would not establish the model’s own feelings, goal appraisal, useful steering, or benefits from storing the prediction across decisions.</p><p>For a future controller, perceived emotional strength and event importance may require different quantities. A mildly worded event can have major consequences for an assigned goal.</p>`,
      },
    ],
    takeaway:
      "Define the person, preserve mixed emotions, use real intensity supervision, and keep unknown labels out of the absent category.",
    quiz: {
      question:
        "A passage was rated for sadness only. How should an unrated anger target be handled?",
      options: [
        "Mark anger absent",
        "Mark anger low",
        "Mask anger as unknown unless absence was established",
      ],
      correct: 2,
      explanation:
        "Lack of an annotation is not evidence of absence. Treating unknowns as absent creates false supervision and misleading accuracy.",
    },
    sources: [perception(), proposal()],
  },
  {
    id: "training",
    title: "Loss, gradients and optimization",
    eyebrow: "06 · Optimization",
    minutes: 9,
    lab: "optimization",
    summary:
      "Training objectives, update size, data exposure and performance on unfamiliar examples.",
    sections: [
      {
        title: "Supervised targets and loss",
        body: `<p>Supervised training provides inputs and known targets. A classification model outputs probabilities, and <strong>cross-entropy</strong> penalizes assigning little probability to the correct target. For one correct class, the loss is <code>−log P(correct)</code>. Confident errors cost much more than uncertain correct predictions.</p><p>A loss is the goal the optimizer actually follows. If it rewards choosing A or B but says nothing about retaining arithmetic, arithmetic preservation is not automatically guaranteed. Adding a preservation objective can help in principle, but its reference examples, strength and interaction with the main task must be tested rather than assumed effective.</p>`,
      },
      {
        title: "Backpropagation and learning rate",
        body: `<p><strong>Backpropagation</strong> computes how the loss changes with each trainable parameter. These derivatives are gradients. An optimizer such as AdamW uses them to choose updates. The <strong>learning rate</strong> scales the steps; it is neither the number of examples nor the number of trainable weights.</p><p>A large rate may learn quickly, overshoot, collapse to one answer, or disturb existing skills. A small rate may preserve behavior but make slow progress. A short unsuccessful low-rate run does not prove the task cannot be learned. It does establish that the tested budget and recipe did not achieve the declared endpoint.</p>`,
      },
      {
        title: "Batches, updates, microbatches and epochs",
        body: `<p>A <strong>batch</strong> is the set of examples contributing to an update. Eight examples per update for 32 updates gives 256 example presentations. They need not be 256 distinct examples. An <strong>epoch</strong> is one pass through a training dataset. Repeating examples increases exposure without increasing the variety of evidence.</p><p>A microbatch is a smaller processing chunk; gradient accumulation can combine several before updating. This helps fit memory limits. Compare data budget, token budget and training time explicitly. Longer prompts can cost more even when the example count matches. Equal update counts do not automatically mean equal compute.</p>`,
      },
      {
        title: "Overfitting and held-out evaluation",
        body: `<p>A model can fit training examples while failing on new ones: <strong>overfitting</strong>. Use training data to fit weights, development data to select settings or stopping time, and a held-out test set for the final assessment. Regularization and early stopping discourage some overfitting but do not replace a proper split.</p><p>Inspect learning curves, output validity, class balance and unrelated skills. If a model always chooses A, more examples may simply reinforce a bad trajectory. The optimization lab changes a small synthetic objective. The objective has a smooth curve; neural training has many interacting parameters and less predictable behavior.</p><p>Training loss and evaluation loss should therefore be tracked together. A falling training curve alone cannot establish better performance on unfamiliar passages or preserved reasoning skills.</p>`,
      },
    ],
    takeaway:
      "Distinct examples, repeated exposure, update count and learning rate are separate experimental choices.",
    quiz: {
      question: "What does 32 updates with a batch of eight establish?",
      options: [
        "Exactly 256 different training examples",
        "256 example presentations, which may include repeats",
        "32 epochs",
      ],
      correct: 1,
      explanation:
        "Updates times batch size counts presentations. Dataset size and sampling determine uniqueness and epochs.",
    },
    sources: [
      {
        label: "PyTorch: optimizing model parameters",
        url: "https://pytorch.org/tutorials/beginner/basics/optimization_tutorial.html",
      },
      source(
        "Direct teaching versus reward learning",
        "docs/results/2026-10-17-rl-signal-objective-v1/README.md",
      ),
    ],
  },
  {
    id: "fine-tuning",
    title: "Fine-tuning and LoRA",
    eyebrow: "07 · LoRA and capacity",
    minutes: 8,
    lab: "lora",
    summary:
      "Low-rank weight updates, trainable parameter counts and the distinction between capacity and optimization.",
    sections: [
      {
        title: "Full and parameter-efficient fine-tuning",
        body: `<p><strong>Fine-tuning</strong> trains a pretrained model further for a task. Full fine-tuning changes many or all base weights. Parameter-efficient methods change a smaller set while retaining the base. This can reduce optimizer memory and storage; it does not eliminate the cost of running the large model.</p><p>In this project, LoRA is one way to teach Qwen to respond to an added signal. That is different from training a small probe to read frozen Qwen activations. In the first case the language model’s behavior is adapted; in the second the large model remains fixed while a separate reader learns.</p>`,
      },
      {
        title: "Low-rank weight changes",
        body: `<p>For a weight matrix W, <strong>LoRA</strong> adds a learned change expressed as the product of two smaller matrices: <code>W′ = W + BA</code>, with a scaling factor omitted here for clarity. The base W can stay frozen while A and B learn.</p><p>The <strong>rank</strong> controls the size of this factorization. Larger rank permits a broader family of updates and uses more trainable parameters. The actual count also depends on which projection matrices receive adapters. Rank eight does not mean eight total parameters, nor eight emotion concepts. In the project’s broad projection configuration it corresponds to millions of trainable numbers.</p>`,
      },
      {
        title: "Capacity and optimization",
        body: `<p><strong>Capacity</strong> concerns what a model family can represent. Optimization concerns whether the training procedure finds a useful solution. A model stuck choosing A could have inadequate capacity, poor exploration, a disruptive signal, unsuitable learning settings, or a bug. The failure alone does not identify which explanation is correct.</p><p>If the same configuration learns the mapping in some runs, it has demonstrated capacity for that particular task. Reproducibility remains another problem. Increasing rank changes capacity and training behavior together, so a matched comparison is needed. More adjustable weights can also permit larger unwanted changes.</p>`,
      },
      {
        title: "Skill preservation and matched comparisons",
        body: `<p>Freezing base weights does not freeze behavior. LoRA updates change the model’s effective computation and can degrade earlier skills. <strong>Catastrophic forgetting</strong> describes loss of previously useful abilities during new training, though a small arithmetic screen cannot measure the full phenomenon.</p><p>Evaluate initial and final models on the new task and relevant unrelated tasks. Compare adapters from identical starting points, document any format warmup, and disclose whether adapters are replaced, stacked or merged. The LoRA lab displays a low-rank update in a small matrix. It illustrates the factorization rather than predicting which rank will work for PAFS-LM.</p><p>A matched rank comparison should keep data, starting behavior and training budget aligned. Otherwise a different result may come from a changed recipe rather than rank.</p>`,
      },
    ],
    takeaway:
      "LoRA restricts which weight changes are trained. It saves resources but does not guarantee stable learning or preservation of existing skills.",
    quiz: {
      question:
        "A rank-eight LoRA learns a mapping in two runs and fails in one. What is supported?",
      options: [
        "Rank eight cannot represent the mapping",
        "The setup can learn this mapping, but training is unreliable",
        "The failed run proves more rank is necessary",
      ],
      correct: 1,
      explanation:
        "Successful runs demonstrate capacity in this setup. The failed run raises a reliability question; it does not by itself diagnose insufficient rank.",
    },
    sources: [
      {
        label: "LoRA: Low-Rank Adaptation of Large Language Models",
        url: "https://arxiv.org/abs/2106.09685",
      },
      source(
        "Matched LoRA-rank follow-up",
        "docs/results/2026-10-17-rl-signal-followup/README.md",
      ),
    ],
  },
  {
    id: "reinforcement-learning",
    title: "Reinforcement learning",
    eyebrow: "08 · Policies and rewards",
    minutes: 10,
    lab: "rl",
    summary:
      "Policy gradients, exploration and comparisons with supervised learning in the one-bit experiments.",
    sections: [
      {
        title: "Policies, actions and rewards",
        body: `<p>In <strong>reinforcement learning</strong>, a policy chooses an action and receives feedback from an environment. The aim is higher expected reward. A language model can be a policy when its output selects an action. A <strong>bandit</strong> task has one consequential choice per trial; a longer episode contains linked decisions and potentially delayed consequences.</p><p>The project’s early bit task maps hidden bit 0 to A and bit 1 to B. The learner samples an action and gets reward one if correct, zero otherwise. This tests learning an input channel. Fresh independent trials without accumulated state do not test persistence merely because the input enters through activations.</p>`,
      },
      {
        title: "REINFORCE and exploration",
        body: `<p><strong>REINFORCE</strong> increases the probability of sampled actions that receive better-than-baseline rewards, and reduces it for worse ones. A simplified loss is <code>−(reward − baseline) × log P(sampled action)</code>. An action-independent baseline can reduce gradient variance without telling the model which action is correct.</p><p>An entropy bonus encourages a less concentrated action distribution, helping exploration. It does not guarantee exploration will remain sufficient. If the policy almost always selects A, it may obtain too little useful experience to learn B reliably. Reward learning is sensitive to sampling, initialization and update settings.</p>`,
      },
      {
        title: "Supervised learning as a diagnostic",
        body: `<p>Supervised cross-entropy directly increases the probability of a supplied correct target. REINFORCE works through a sampled action and its reward. In the special binary task, the action plus binary reward reveals the correct label, so researchers can reconstruct targets and compare the two objectives.</p><p>If direct teaching works more reliably, that suggests the signal is learnable while the tested reward-learning procedure is a bottleneck. It is not proof that RL always fails. Nor does this special task demonstrate label efficiency: here rewards contain enough information to recover the answer. Keep actual RL successes separate from supervised successes.</p>`,
      },
      {
        title: "Information controls and evaluation",
        body: `<p>A no-information group should average chance on balanced hidden bits. Beating it shows that some information was used. A text-information group receives the same bit in words; comparing with it asks whether internal delivery offers a useful alternative. Both groups need competent training and valid native answers.</p><p>Measure ordinary skills before and after training. Report mean probability of the rewarding action, greedy accuracy, sampled rewards and unrestricted validity as distinct quantities. The reward lab uses synthetic outcomes to illustrate exploration and policy collapse. It does not replay or simulate the repository’s measured learning curves.</p><p>Reward design also matters: optimizing an easy proxy can improve that proxy without improving the intended behavior. Evaluate the actual goal on held-out episodes.</p>`,
      },
    ],
    takeaway:
      "A learned internal bit channel is evidence of input-channel learnability. Persistent emotional feedback requires additional state, episodes and comparative utility tests.",
    quiz: {
      question:
        "A fresh hidden bit is supplied independently on each one-step trial. What does successful learning primarily establish?",
      options: [
        "Useful persistent emotional memory",
        "Ability to use that input channel for this mapping",
        "An advantage over ordinary text in general",
      ],
      correct: 1,
      explanation:
        "There is no cross-trial state to test persistence, and channel use alone does not establish an advantage over an equally informative text input.",
    },
    sources: [
      source(
        "Original internal-signal RL experiment",
        "docs/results/2026-10-17-rl-signal/README.md",
      ),
      source(
        "Supervised versus RL objective diagnostic",
        "docs/results/2026-10-17-rl-signal-objective-v1/README.md",
      ),
    ],
  },
  {
    id: "memory",
    title: "History, external memory and retention",
    eyebrow: "09 · Persistence",
    minutes: 10,
    lab: "memory",
    summary:
      "Current-state tables, state lifetimes and comparisons between persistent state and ordinary memory.",
    sections: [
      {
        title: "Event history and current-state tables",
        body: `<p>Suppose the history says “A points to B,” then “B points to D,” then “A now points to C.” A current-state table records A→C and B→D. Both contain the underlying facts, but the table has already resolved which instruction overwrote which.</p><p>In the pointer experiments, a separate deterministic program applies the writes and reconstructs the exact table. It is not a model-generated summary. The table is independent of the question; the model must still answer queries such as following two links. The text-memory group receives the full history plus this table. The history group receives the history alone.</p>`,
      },
      {
        title: "Where state is stored",
        body: `<p>The notebook is <strong>external memory</strong>: software maintains it, and a text rendering enters the prompt. Its entries last until changed or reset. The model’s context contains the supplied version during a request. Neither mechanism automatically stores the table in the model’s parameters.</p><p>An affective controller is another external state, but it may compress events into quantities such as setback intensity that decay across decisions. That compression discards details. Define when the clock advances, when state resets, how new events combine, and what information reaches the model. “Persistent” needs a declared boundary: across tokens, requests, decisions, or complete episodes.</p>`,
      },
      {
        title: "Active assistance and retained skill",
        body: `<p>A student may answer better with a reference sheet without gaining extra unaided skill from studying with it. Similarly, performance with a table and performance after its withdrawal measure different benefits.</p><p>The matched-time project comparison averaged 92.32% with text tables and 73.44% with history alone. But one table run reached only 79.69%, failing the required every-run 90% floor, and preservation remained uncertain. A separate withdrawal study did not establish extra unaided retention. These findings support a useful, variable active aid in a narrow task; they do not establish emotional or general learning-speed advantages.</p>`,
      },
      {
        title: "Persistence, structure and delivery controls",
        body: `<p>To test persistence, compare carrying state forward with resetting it while keeping other conditions matched. To test emotional structure, compare the proposed state against strong ordinary summaries containing equivalent relevant information. To test delivery, supply the same state as text and through activations.</p><p>Also specify whether triggering events remain in the context. A model with complete history may reconstruct state without the controller; removing history changes the problem. The memory lab applies writes to a current-state table using invented examples. Table entries persist until overwritten; an affective controller’s gradual decay would require a separate mechanism and test.</p><p>A future test can remove the triggering event from later prompts while preserving external state. That isolates a different question from helping a model interpret complete history.</p>`,
      },
    ],
    takeaway:
      "Memory can help while present without creating extra skill after removal. Test active utility, persistence, delivery and retained learning as separate claims.",
    quiz: {
      question:
        "Why is history plus a current table easier to use than history alone?",
      options: [
        "The table necessarily supplies secret new observations",
        "External software has already resolved updates and overwrites",
        "The model must have stored all facts in its weights",
      ],
      correct: 1,
      explanation:
        "The information may be equivalent, but the representation reduces bookkeeping. That preprocessing is part of the system and should be acknowledged and costed.",
    },
    sources: [
      memoryReport(),
      source(
        "Memory withdrawal evaluation",
        "docs/results/2026-10-17-concept-memory-retention/README.md",
      ),
      proposal(),
    ],
  },
  {
    id: "experiments",
    title: "Experimental design",
    eyebrow: "10 · Controls and evaluation",
    minutes: 10,
    lab: "experiment",
    summary:
      "Research questions, comparison groups, data splits, resource budgets and stopping rules.",
    sections: [
      {
        title: "Research questions and controls",
        body: `<p>“Does the apparatus work?” bundles many questions. A stronger question is “Does multilayer nonlinear reading reduce held-out intensity error compared with a single-layer linear reader?” Another is “Does keeping the same external state across decisions improve reward relative to resetting it?”</p><p>A <strong>control</strong> makes a specific alternative explanation testable. A random vector controls some effects of injecting arbitrary activity. A text-state group controls access to information. A reset-state group controls persistence. No single control substitutes for all the others. Start with the main contrast and change as few things as possible between its groups.</p>`,
      },
      {
        title: "Task qualification and positive controls",
        body: `<p>A task that the model cannot perform even with clear correct information is a poor instrument for testing subtle memory benefits. Check instructions, output parsing, answer-order sensitivity and a strong information-present condition. Include a positive control expected to work.</p><p>Define a small qualification check and stopping rule beforehand. If it fails, close that instrument and explain what remains unanswered. Likewise, a successful detector study need not wait for a solved activation-control problem. Independent workstreams should answer independent questions, rather than forming an ever-growing chain of prerequisites.</p>`,
      },
      {
        title: "Grouped splits and data leakage",
        body: `<p><strong>Data leakage</strong> occurs when information reserved for evaluation influences fitting or selection. Randomly splitting paraphrases from the same story can create an overly easy test. Group original stories, related passages and repeated person annotations before splitting.</p><p>Training data fits weights. Development data guides architecture, prompts and stopping. Test data assesses frozen choices. After examining test failures and changing the system, that test is no longer untouched confirmation. A new held-out sample is needed for a fresh confirmatory claim. Even a clean local split cannot prove a public dataset was absent from the language model’s pretraining.</p>`,
      },
      {
        title: "Predeclared outcomes and resource budgets",
        body: `<p>Before outcomes, declare the primary metric, meaningful effect size, quality constraints, resource budget and stopping rule. Save raw predictions and configurations, including failed runs. Small exploratory pilots can guide a later confirmation, provided their status is explicit.</p><p>Match the relevant resource: examples, tokens, updates or time. Explain what the budget excludes, such as summary construction. Record multiple training seeds when practical. Then ask what the result changes: proceed, diagnose one named uncertainty, or stop this configuration. The experiment lab compares the purposes of different controls. It does not assess the scientific validity of a proposed study.</p><p>Keep exploratory analyses useful by labeling them clearly. A surprising pattern can motivate the next study without being treated as a prediction confirmed by the same data.</p>`,
      },
    ],
    takeaway:
      "Specify the uncertainty each experiment should resolve and the result that would justify continuing, diagnosing a problem or stopping.",
    quiz: {
      question:
        "You inspect final test failures and rewrite the prompt. What should happen before a fresh confirmatory claim?",
      options: [
        "Reuse the same test and call it untouched",
        "Evaluate the fixed revision on a new held-out sample",
        "Exclude the previously failed examples",
      ],
      correct: 1,
      explanation:
        "The old test has influenced development. Preserve its results and evaluate a new held-out sample for a fresh confirmatory claim.",
    },
    sources: [
      perception(),
      source(
        "Active research roadmap",
        "docs/studies/concept_feedback_roadmap.md",
      ),
      memoryReport(),
    ],
  },
  {
    id: "reading-results",
    title: "Metrics and uncertainty",
    eyebrow: "11 · Interpreting results",
    minutes: 10,
    lab: "evidence",
    summary:
      "Accuracy, ordinal errors, calibration, confidence intervals and the limits of component findings.",
    sections: [
      {
        title: "Metrics and independent observations",
        body: `<p>Accuracy is the fraction of correct predictions. A change from 60% to 70% is ten <strong>percentage points</strong>, or about a 16.7% relative increase. Those are different descriptions. A large number of rows can still represent few independent stories or training runs.</p><p><strong>Macro averaging</strong> gives each emotion equal weight instead of letting common labels dominate. Ordinal absolute error counts distance between levels: predicting low instead of high gives an error of two on the 0–3 code. These numeric distances are a working evaluation convention. Inspect per-emotion and present-only results so successful absence prediction does not conceal poor intensity recognition.</p>`,
      },
      {
        title: "Accuracy, calibration and confidence intervals",
        body: `<p>A calibrated model’s 80%-confidence predictions should be correct about 80% of the time across comparable cases. Accuracy alone cannot establish calibration. A confusion matrix shows which labels are mixed up, while a calibration plot compares confidence with observed frequency.</p><p>A <strong>confidence interval</strong> expresses uncertainty under a specified sampling procedure. It is not a guarantee and is not literally a 95% probability assigned to this fixed interval containing the true value. Resample related examples together when they share a story. Training-seed variation deserves separate attention: many test rows cannot replace independent training runs.</p>`,
      },
      {
        title: "Composite criteria and noninferiority",
        body: `<p>The matched-time memory study found a positive average table advantage, but failed its combined reliability and preservation criterion. Both statements can be true. Do not erase the positive component; do not promote it into a reliable quality-preserving system claim.</p><p><strong>Noninferiority</strong> asks whether a loss larger than a declared margin can be ruled out. Failure to establish preservation does not necessarily demonstrate damage. Likewise, an interval crossing zero does not prove no effect. Look at plausible effect sizes, uncertainty, the prespecified threshold and practical consequences rather than reducing everything to pass or fail.</p>`,
      },
      {
        title: "Claims supported by each experiment",
        body: `<p>A detector score supports prediction of its annotations. A successful bit channel supports that mapping in the tested setup. A useful table supports external preprocessing in that task. The original PAFS-LM claim additionally needs persistent emotional feedback to improve learning against strong ordinary-memory alternatives.</p><p>When reading a report, ask: What was trained? What information did each group receive? Was evaluation native or restricted? What varied across runs? What failed? What remains untested? The evidence lab uses invented results to show how sample size and variability affect uncertainty. The linked reports contain the project’s measurements.</p><p>A research update should state the strongest supported finding and its limits. Component successes require separate interpretation from evidence for the original hypothesis.</p>`,
      },
    ],
    takeaway:
      "Interpret component findings separately from the central claim. Report the observed change, its uncertainty and the experiment’s limits.",
    quiz: {
      question:
        "A preservation interval includes both a negligible change and a loss beyond the allowed margin. What is justified?",
      options: [
        "Preservation is established",
        "Damage is definitely established",
        "Preservation is uncertain under the declared margin",
      ],
      correct: 2,
      explanation:
        "The study has not ruled out unacceptable loss, but uncertainty that includes little or no loss is not proof of harm.",
    },
    sources: [
      memoryReport(),
      perception(),
      source(
        "Roadmap and limits on current claims",
        "docs/studies/concept_feedback_roadmap.md",
      ),
    ],
  },
];

export const glossary = [
  {
    term: "Activation",
    definition:
      "A temporary numerical value computed inside a model for a particular input.",
    lesson: "activations",
  },
  {
    term: "Attention",
    definition:
      "A transformer operation that combines information from relevant token representations.",
    lesson: "language-models",
  },
  {
    term: "Backpropagation",
    definition:
      "The computation of loss gradients through a network so trainable parameters can be updated.",
    lesson: "training",
  },
  {
    term: "Bandit",
    definition:
      "A reward-learning task with one consequential action per trial.",
    lesson: "reinforcement-learning",
  },
  {
    term: "Baseline",
    definition:
      "A reference method or condition used to judge an improvement; in policy gradients, also an action-independent reward reference.",
    lesson: "reinforcement-learning",
  },
  {
    term: "Batch",
    definition:
      "The examples whose gradients contribute to one optimizer update.",
    lesson: "training",
  },
  {
    term: "Calibration",
    definition:
      "Agreement between predicted confidence and observed frequencies of correctness or outcomes.",
    lesson: "reading-results",
  },
  {
    term: "Capacity",
    definition:
      "The range of functions a model configuration can represent, distinct from whether training finds a useful one.",
    lesson: "fine-tuning",
  },
  {
    term: "Causal intervention",
    definition:
      "A deliberate change used to test whether a component influences an outcome.",
    lesson: "activations",
  },
  {
    term: "Checkpoint",
    definition:
      "A saved model or training state that records a particular point in a run.",
    lesson: "training",
  },
  {
    term: "Confidence",
    definition:
      "How much probability a predictor assigns to an outcome; it is different from emotional strength.",
    lesson: "emotion-intensity",
  },
  {
    term: "Confidence interval",
    definition:
      "An uncertainty interval produced by a procedure with stated long-run coverage assumptions.",
    lesson: "reading-results",
  },
  {
    term: "Context",
    definition: "The token sequence available to the model during a request.",
    lesson: "foundations",
  },
  {
    term: "Control",
    definition:
      "A comparison condition designed to test a particular alternative explanation.",
    lesson: "experiments",
  },
  {
    term: "Cross-entropy",
    definition:
      "A supervised loss that penalizes assigning low probability to the correct target.",
    lesson: "training",
  },
  {
    term: "Data leakage",
    definition:
      "Evaluation information influencing fitting or selection in a way that makes the test misleading.",
    lesson: "experiments",
  },
  {
    term: "Development set",
    definition:
      "Examples used to choose prompts, settings, architecture or stopping before final evaluation.",
    lesson: "experiments",
  },
  {
    term: "Embedding",
    definition:
      "A numerical vector representing an item or pattern; learned coordinates need not have individual human meanings.",
    lesson: "probes",
  },
  {
    term: "Entropy",
    definition: "A measure of how spread out a probability distribution is.",
    lesson: "reinforcement-learning",
  },
  {
    term: "Epoch",
    definition: "One pass through the training dataset.",
    lesson: "training",
  },
  {
    term: "External state",
    definition:
      "Information stored by software outside the model’s weights and current computation.",
    lesson: "memory",
  },
  {
    term: "Experiencer",
    definition:
      "The specific person whose emotion an annotation or prediction describes.",
    lesson: "emotion-intensity",
  },
  {
    term: "Fine-tuning",
    definition:
      "Further training of a pretrained model or its adapters for a new objective.",
    lesson: "fine-tuning",
  },
  {
    term: "Frozen",
    definition:
      "Held fixed during training; a frozen model can still compute different activations for different inputs.",
    lesson: "foundations",
  },
  {
    term: "Generalization",
    definition:
      "Performance beyond the particular examples used to fit or select a model.",
    lesson: "experiments",
  },
  {
    term: "Gradient",
    definition:
      "The derivative describing how a loss changes with a trainable parameter.",
    lesson: "training",
  },
  {
    term: "Greedy decoding",
    definition:
      "Choosing the highest-scoring next token rather than sampling from the distribution.",
    lesson: "language-models",
  },
  {
    term: "Hidden vector",
    definition:
      "A list of numbers representing a token at an internal stage of a model.",
    lesson: "activations",
  },
  {
    term: "Inference",
    definition:
      "Running a model to obtain outputs, usually without updating its parameters.",
    lesson: "foundations",
  },
  {
    term: "Intensity",
    definition:
      "The strength of an annotated emotion under a declared rating scale.",
    lesson: "emotion-intensity",
  },
  {
    term: "Learning rate",
    definition: "A setting controlling the scale of optimizer updates.",
    lesson: "training",
  },
  {
    term: "Linear probe",
    definition:
      "A predictor that reads recorded representations using weighted sums and a prediction rule.",
    lesson: "probes",
  },
  {
    term: "Logit",
    definition: "A raw model score before conversion to probabilities.",
    lesson: "language-models",
  },
  {
    term: "LoRA",
    definition:
      "Low-rank adaptation: learning factorized weight updates while base weights can remain frozen.",
    lesson: "fine-tuning",
  },
  {
    term: "Loss",
    definition: "The numerical objective minimized by training.",
    lesson: "training",
  },
  {
    term: "Macro average",
    definition:
      "An average that gives each supported category equal weight rather than weighting by frequency.",
    lesson: "reading-results",
  },
  {
    term: "Mask",
    definition:
      "A rule excluding unsupported or missing labels from the relevant training loss or metric.",
    lesson: "emotion-intensity",
  },
  {
    term: "MLP",
    definition:
      "A multilayer perceptron: a feed-forward network using learned layers and nonlinear transformations.",
    lesson: "probes",
  },
  {
    term: "Multilabel",
    definition:
      "A prediction task allowing several categories to apply to the same example.",
    lesson: "emotion-intensity",
  },
  {
    term: "Native validity",
    definition:
      "Whether unrestricted model output follows the required answer format or allowed action set.",
    lesson: "language-models",
  },
  {
    term: "Noninferiority",
    definition:
      "A test of whether a decline larger than a prespecified acceptable margin can be ruled out.",
    lesson: "reading-results",
  },
  {
    term: "Ordinal",
    definition:
      "Categories with a meaningful order, such as absent, low, medium and high.",
    lesson: "emotion-intensity",
  },
  {
    term: "Overfitting",
    definition:
      "Learning training-specific patterns that fail to transfer to new examples.",
    lesson: "training",
  },
  {
    term: "Parameter",
    definition: "A learned numerical setting in a model, also called a weight.",
    lesson: "foundations",
  },
  {
    term: "Percentage point",
    definition:
      "The absolute difference between two percentages; 60% to 70% is ten points.",
    lesson: "reading-results",
  },
  {
    term: "Policy",
    definition:
      "The rule or probability distribution a learner uses to choose actions.",
    lesson: "reinforcement-learning",
  },
  {
    term: "Pooling",
    definition:
      "Combining or selecting token representations to obtain one representation for a passage.",
    lesson: "activations",
  },
  {
    term: "Probe",
    definition:
      "A trained reader used to test what information is extractable from internal representations.",
    lesson: "probes",
  },
  {
    term: "Rank",
    definition:
      "The factorization size that constrains a LoRA update’s expressive range and parameter count.",
    lesson: "fine-tuning",
  },
  {
    term: "REINFORCE",
    definition:
      "A policy-gradient method that learns from sampled actions and their rewards.",
    lesson: "reinforcement-learning",
  },
  {
    term: "Residual stream",
    definition:
      "The running token-vector representation that transformer blocks read and update.",
    lesson: "activations",
  },
  {
    term: "Seed",
    definition:
      "A setting controlling random choices in a training run; changing it tests some sources of run variation.",
    lesson: "reading-results",
  },
  {
    term: "Softmax",
    definition:
      "A transformation of raw scores into positive probabilities summing to one.",
    lesson: "language-models",
  },
  {
    term: "Steering vector",
    definition:
      "A direction added to internal activations to test or influence behavior.",
    lesson: "activations",
  },
  {
    term: "Supervised learning",
    definition: "Training from inputs paired with supplied correct targets.",
    lesson: "training",
  },
  {
    term: "Temperature",
    definition:
      "A generation setting that makes sampling probabilities more concentrated or more spread out.",
    lesson: "language-models",
  },
  {
    term: "Test set",
    definition:
      "Held-out examples used to assess a system after development choices are fixed.",
    lesson: "experiments",
  },
  {
    term: "Token",
    definition:
      "A vocabulary unit such as a word piece, punctuation mark or combined space-and-text item.",
    lesson: "language-models",
  },
];
