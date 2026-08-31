-- Add the Illustrative Mathematics Algebra I, Geometry, and Algebra II
-- sequences supplied by Zack on 2026-08-31. The update is idempotent and
-- preserves lesson IDs at existing sequence positions.

begin;

insert into public.curriculum_providers (code, name)
values ('illustrative_math', 'Illustrative Mathematics')
on conflict (code) do update set name = excluded.name;

insert into public.curriculum_libraries (provider_id, class_code, class_name)
select provider.id, source.class_code, source.class_name
from public.curriculum_providers provider
cross join (values
  ('A1', 'Algebra I'),
  ('GEO', 'Geometry'),
  ('A2', 'Algebra II')
) as source(class_code, class_name)
where provider.code = 'illustrative_math'
on conflict (provider_id, class_code) do update set class_name = excluded.class_name;

-- Algebra I: 87 lessons from the supplied sequence.
insert into public.curriculum_lessons (library_id, sequence_index, source_lesson_code, title, objective)
select library.id, source.sequence_index, source.source_lesson_code, source.title, source.objective
from public.curriculum_libraries library
join public.curriculum_providers provider on provider.id = library.provider_id
cross join (values
    (1, '2.01', 'Planning a Pizza Party', 'Let’s write expressions to estimate the cost of a pizza party.'),
    (2, '2.02', 'Writing Equations to Model Relationships', 'Let''s look at how equations can help us describe relationships and constraints.'),
    (3, '2.04', 'Equations and Their Solutions', 'Let’s recall what we know about solutions to equations.'),
    (4, '2.05', 'Equations and Their Graphs', 'Let’s graph equations in two variables.'),
    (5, '2.06', 'Equivalent Equations', 'Let''s investigate what makes two equations equivalent.'),
    (6, '2.07', 'Explaining Steps for Rewriting Equations', 'Let’s think about why some steps for rewriting equations are valid but other steps are not.'),
    (7, '2.08', 'Which Variable to Solve for?', 'Let’s rearrange equations to pin down a certain quantity.'),
    (8, '2.10', 'Connecting Equations to Graphs', 'Let’s investigate what graphs can tell us about the equations and relationships they represent.'),
    (9, '2.12', 'Writing and Graphing Systems of Linear Equations', 'Let’s recall what it means to solve a system of linear equations and how to do it by graphing.'),
    (10, '2.13', 'Solving Systems by Substitution', 'Let’s use substitution to solve systems of linear equations.'),
    (11, '2.14', 'Solving Systems by Elimination', 'Let’s investigate how adding or subtracting equations can help us solve systems of linear equations.'),
    (12, '2.17', 'Systems of Linear Equations and Their Solutions', 'Let''s find out how many solutions a system of equations could have.'),
    (13, '2.18', 'Representing Situations with Inequalities', 'Let’s use inequalities to represent constraints in situations.'),
    (14, '2.19', 'Solutions to Inequalities in One Variable', 'Let’s find and interpret solutions to inequalities in one variable.'),
    (15, '2.20', 'Writing and Solving Inequalities in One Variable', 'Let’s solve problems by writing and solving inequalities in one variable.'),
    (16, '2.21', 'Graphing Linear Inequalities in Two Variables', 'Let’s find out how to use graphs to represent solutions to inequalities in two variables.'),
    (17, '2.23', 'Solving Problems with Inequalities in Two Variables', 'Let’s practice writing, interpreting, and graphing solutions to inequalities in two variables.'),
    (18, '2.24', 'Solutions to Systems of Linear Inequalities in Two Variables', 'Let’s look at situations where two constraints (that can be expressed by inequalities) must be met simultaneously.'),
    (19, '2.25', 'Solving Problems with Systems of Linear Inequalities in Two Variables', 'Let’s use systems of inequalities to solve some problems.'),
    (20, '2.26', 'Modeling with Systems of Inequalities in Two Variables', 'Let’s create mathematical models using systems of inequalities.'),
    (21, '4.01', 'Describing and Graphing Situations', 'Let’s look at some fun functions around us and try to describe them.'),
    (22, '4.02', 'Function Notation', 'Let’s learn about a handy way to refer to and talk about a function.'),
    (23, '4.03', 'Interpreting & Using Function Notation', 'Let’s use function notation to talk about functions.'),
    (24, '4.04', 'Using Function Notation to Describe Rules', 'Let’s look at some rules that describe functions and write some, too.'),
    (25, '4.06', 'Features of Graphs', 'Let’s use graphs of functions to learn about situations.'),
    (26, '4.07', 'Using Graphs to Find Average Rate of Change', 'Let’s measure how quickly the output of a function changes.'),
    (27, '4.08', 'Interpreting and Creating Graphs', 'Let’s sketch graphs to represent situations.'),
    (28, '4.09', 'Comparing Graphs', 'Let’s compare graphs of functions to learn about the situations they represent.'),
    (29, '4.10', 'Domain and Range', 'Let’s find all possible inputs and outputs for a function.'),
    (30, '4.12', 'Piecewise Functions', 'Let’s look at functions that are defined in pieces.'),
    (31, '4.13', 'Absolute Value Functions', 'Let’s make some guesses and see how good they are.'),
    (32, '4.15', 'Inverse Functions', 'Let’s define functions forward and backward.'),
    (33, '4.16', 'Finding and Interpreting Inverse Functions', 'Let’s find the inverse of linear functions.'),
    (34, '4.17', 'Writing Inverse Functions to Solve Problems', 'Let’s use inverse functions to solve problems.'),
    (35, '4.18', 'Using Functions to Model Battery Power', 'Let’s use functions to model data and make predictions.'),
    (36, '5.01', 'Growing and Growing', 'Let''s choose the better deal.'),
    (37, '5.02', 'Patterns of Growth', 'Let’s compare different patterns of growth.'),
    (38, '5.03', 'Representing Exponential Growth', 'Let’s explore exponential growth.'),
    (39, '5.04', 'Understanding Decay', 'Let’s look at exponential decay.'),
    (40, '5.05', 'Representing Exponential Decay', 'Let’s think about how to show and talk about exponential decay.'),
    (41, '5.06', 'Analyzing Graphs', 'Let''s compare situations where quantities change exponentially.'),
    (42, '5.07', 'Using Negative Exponents', 'Let’s look more closely at exponential graphs and equations.'),
    (43, '5.08', 'Exponential Situations as Functions', 'Let’s explore exponential functions.'),
    (44, '5.09', 'Interpreting Exponential Functions', 'Let’s find some meaningful ways to represent exponential functions.'),
    (45, '5.10', 'Looking at Rates of Change', 'Let''s calculate average rates of change for exponential functions.'),
    (46, '5.11', 'Modeling Exponential Behavior', 'Let’s use exponential functions to model real life situations.'),
    (47, '5.12', 'Reasoning about Exponential Graphs', 'Let’s study and compare equations and graphs of exponential functions.'),
    (48, '5.15', 'Functions Involving Percent Change', 'Let''s investigate what happens when we repeatedly apply a percent increase to a quantity.'),
    (49, '5.16', 'Compounding Interest', 'Let''s explore different ways of repeatedly applying a percent increase.'),
    (50, '5.17', 'Different Compounding Intervals', 'Let''s find out what happens when we repeatedly apply the same percent increase at different intervals of time.'),
    (51, '5.18', 'Expressed in Different Ways', 'Let''s write exponential expressions in different ways.'),
    (52, '5.19', 'Which Ones Changes Faster?', 'Let''s compare linear and exponential functions as they continue to increase.'),
    (53, '5.20', 'Changes over Equal Intervals', 'Let''s explore how linear and exponential functions change over equal intervals.'),
    (54, '5.21', 'Predicting Populations', 'Let''s use linear and exponential models to represent and understand population changes.'),
    (55, '6.01', 'A Different Kind of Change', 'Let’s find the rectangle with the greatest area.'),
    (56, '6.02', 'How Does it Change?', 'Let’s describe some patterns of change.'),
    (57, '6.03', 'Building Quadratic Functions from Geometric Patterns', 'Let’s describe some other geometric patterns.'),
    (58, '6.04', 'Comparing Quadratic and Exponential Functions', 'Let’s compare quadratic and exponential changes and see which one grows faster.'),
    (59, '6.05', 'Building Quadratic Functions to Describe Situations', 'Let’s measure falling objects.'),
    (60, '6.08', 'Equivalent Quadratic Expressions', 'Let’s use diagrams to help us rewrite quadratic expressions.'),
    (61, '6.09', 'Standard Form and Factored Form', 'Let’s write quadratic expressions in different forms.'),
    (62, '6.10', 'Graphs of Functions in Standard and Factored Form', 'Let’s find out what quadratic expressions in standard and factored forms can reveal about the properties of their graphs.'),
    (63, '6.11', 'Graphing from the Factored Form', 'Let’s graph some quadratic functions in factored form.'),
    (64, '6.12', 'Graphing the Standard Form', 'Let’s see how the numbers in expressions like -3x^2 + 4 affect their graph.'),
    (65, '6.14', 'Graphs That Represent Situations', 'Let’s examine graphs that represent the paths of objects being launched in the air.'),
    (66, '6.15', 'Vertex Form', 'Let’s find out about the vertex form.'),
    (67, '6.16', 'Graphing from the Vertex Form', 'Let’s graph equations in vertex form.'),
    (68, '6.17', 'Changing the Vertex', 'Let’s write new quadratic equations in vertex form to produce certain graphs.'),
    (69, '7.01', 'Finding Unknown Inputs', 'Let’s find some new equations to solve.'),
    (70, '7.02', 'When and Why Do We Write Quadratic Equations?', 'Let’s try to solve some quadratic equations.'),
    (71, '7.03', 'Solving Quadratic Equations by Reasoning', 'Let’s find solutions to quadratic equations.'),
    (72, '7.04', 'Solving Quadratic Equations with the Zero Product Property', 'Let’s find solutions to equations that contain products that equal zero.'),
    (73, '7.05', 'How Many Solutions?', 'Let’s use graphs to investigate quadratic equations that have two solutions, one solution, or no solutions.'),
    (74, '7.06', 'Rewriting Quadratic Expressions in Factored Form', 'Let’s write expressions in factored form.'),
    (75, '7.07', 'Rewriting Quadratic Expressions in Factored Form (Part 2)', 'Let’s write some more expressions in factored form.'),
    (76, '7.09', 'Solving Quadratic Equations by Using Factored Form', 'Let’s solve some quadratic equations that before now we could only solve by graphing.'),
    (77, '7.11', 'What are Perfect Squares?', 'Let’s see how perfect squares make some equations easier to solve.'),
    (78, '7.12', 'Completing the Square', 'Let’s learn a new method for solving quadratic equations.'),
    (79, '7.15', 'Quadratic Equations with Irrational Solutions', 'Let’s find exact solutions to quadratic equations even if the solutions are irrational.'),
    (80, '7.16', 'The Quadratic Formula', 'Let’s learn a formula for finding solutions to quadratic equations.'),
    (81, '7.17', 'Applying the Quadratic Formula', 'Let’s use the quadratic formula to solve some problems.'),
    (82, '7.19', 'Deriving the Quadratic Formula', 'Let’s find out where the quadratic formula comes from.'),
    (83, '7.20', 'Rational and Irrational Solutions', 'Let’s consider the kinds of numbers we get when solving quadratic equations.'),
    (84, '7.21', 'Sums and Products of Rational and Irrational Numbers', 'Let’s make convincing arguments about why the sums and products of rational and irrational numbers are always certain kinds of numbers.'),
    (85, '7.22', 'Rewriting Quadratic Expressions in Vertex Form', 'Let’s see what else completing the square can help us do.'),
    (86, '7.23', 'Using Quadratic Expressions in Vertex Form to Solve Problems', 'Let’s find the maximum or minimum value of a quadratic function.'),
    (87, '7.24', 'Using Quadratic Equations to Model Situations and Solve Problems', 'Let’s analyze a situation modeled by a quadratic equation.')
) as source(sequence_index, source_lesson_code, title, objective)
where provider.code = 'illustrative_math'
  and library.class_code = 'A1'
on conflict (library_id, sequence_index) do update set
  source_lesson_code = excluded.source_lesson_code,
  title = excluded.title,
  objective = excluded.objective;

delete from public.curriculum_lessons lesson
using public.curriculum_libraries library, public.curriculum_providers provider
where lesson.library_id = library.id
  and library.provider_id = provider.id
  and provider.code = 'illustrative_math'
  and library.class_code = 'A1'
  and lesson.sequence_index > 87;

-- Geometry: 110 lessons from the supplied sequence.
insert into public.curriculum_lessons (library_id, sequence_index, source_lesson_code, title, objective)
select library.id, source.sequence_index, source.source_lesson_code, source.title, source.objective
from public.curriculum_libraries library
join public.curriculum_providers provider on provider.id = library.provider_id
cross join (values
    (1, '1.01', 'Build It', 'Let’s use tools to create shapes precisely.'),
    (2, '1.02', 'Constructing Patterns', 'Let’s use compass and straightedge constructions to make patterns.'),
    (3, '1.03', 'Construction Techniques 1: Perpendicular Bisectors', 'Let’s explore equal distances.'),
    (4, '1.04', 'Construction Techniques 2: Equilateral Triangles', 'Let’s identify what shapes are possible within the construction of a regular hexagon.'),
    (5, '1.05', 'Construction Techniques 3: Perpendicular Lines and Angle Bisectors', 'Let’s use tools to solve some construction challenges.'),
    (6, '1.06', 'Construction Techniques 4: Parallel and Perpendicular Lines', 'Let’s use tools to draw parallel and perpendicular lines precisely.'),
    (7, '1.07', 'Construction Techniques 5: Squares', 'Let’s use straightedge and compass moves to construct squares.'),
    (8, '1.09', 'Speedy Delivery', 'Let’s use perpendicular bisectors.'),
    (9, '1.10', 'Rigid Transformations', 'Let’s draw some transformations.'),
    (10, '1.11', 'Defining Reflections', 'Let’s reflect some figures.'),
    (11, '1.12', 'Defining Translations', 'Let’s translate some figures.'),
    (12, '1.13', 'Incorporating Rotations', 'Let''s draw some transformations.'),
    (13, '1.14', 'Defining Rotations', 'Let’s rotate shapes precisely.'),
    (14, '1.15', 'Symmetry', 'Let’s describe some symmetries of shapes.'),
    (15, '1.16', 'More Symmetry', 'Let’s describe more symmetries of shapes.'),
    (16, '1.17', 'Working With Rigid Transformations', 'Let’s compare transformed figures.'),
    (17, '1.19', 'Evidence, Angles, and Proofs', 'Let’s make convincing explanations.'),
    (18, '1.20', 'Transformations, Transversals & Proofs', 'Let’s prove statements about parallel lines.'),
    (19, '1.21', 'One Hundred and Eighty', 'Let’s prove the Triangle Angle Sum Theorem.'),
    (20, '2.01', 'Congruent Parts,', 'Let’s figure out what the corresponding sides and angles in figures have to do with congruence.'),
    (21, '2.03', 'Congruent Triangles,', 'Let’s use transformations to be sure that two triangles are congruent.'),
    (22, '2.05', 'Points, Segments, and Zigzags', 'Let’s figure out when segments are congruent.'),
    (23, '2.06', 'Side-Angle-Side Triangle Congruence', 'Let’s use definitions and theorems to figure out what must be true about shapes, without having to measure all parts of the shapes.'),
    (24, '2.07', 'Angle-Side-Angle Triangle Congruence', 'Let’s see if we can prove other sets of measurements that guarantee triangles are congruent, and apply those theorems.'),
    (25, '2.08', 'The Perpendicular Bisector Theorem', 'Let’s convince ourselves that what we’ve conjectured about perpendicular bisectors must be true.'),
    (26, '2.09', 'Side-Side-Side Triangle Congruence', 'Let’s see if we can prove one more set of conditions that guarantee triangles are congruent, and apply theorems.'),
    (27, '2.10', 'Practicing Proofs', 'Let’s practice what we’ve learned about proofs and congruence.'),
    (28, '2.12', 'Proofs about Quadrilaterals', 'Let’s prove theorems about quadrilaterals and their diagonals.'),
    (29, '2.13', 'Proofs about Parallelograms', 'Let’s prove theorems about parallelograms.'),
    (30, '2.14', 'Bisect It', 'Let’s prove that some constructions we conjectured about really work.'),
    (31, '2.15', 'Congruence for Quadrilaterals', 'Let’s investigate how congruence for quadrilaterals is similar to and different from congruence for triangles.'),
    (32, '3.01', 'Scale Drawings', 'Let’s make a scale drawing.'),
    (33, '3.03', 'Measuring Dilations', 'Let’s dilate polygons.'),
    (34, '3.04', 'Dilating Lines and Angles', 'Let’s dilate lines and angles.'),
    (35, '3.05', 'Splitting Triangle Sides with Dilation,', 'Let’s draw segments connecting midpoints of the sides of triangles.'),
    (36, '3.06', 'Connecting Similarity and Transformations', 'Let’s identify similar figures.'),
    (37, '3.07', 'Reasoning about Similarity with Transformations', 'Let’s describe similar triangles.'),
    (38, '3.08', 'Are They All Similar?', 'Let’s prove figures are similar.'),
    (39, '3.09', 'Conditions for Triangle Similarity', 'Let’s prove some triangles similar.'),
    (40, '3.13', 'Using the Pythagorean Theorem and Similarity', 'Let’s explore right triangles with altitudes drawn to the hypotenuse.'),
    (41, '3.14', 'Proving the Pythagorean Theorem', 'Let’s prove the Pythagorean Theorem.'),
    (42, '3.15', 'Finding All the Unknown Values in Triangles', 'Let’s find all the unknown values in right triangles.'),
    (43, '3.16', 'Bank Shot', 'Let’s use similarity to solve problems.'),
    (44, '4.01', 'Angles and Steepness', 'Let’s solve problems about right triangles.'),
    (45, '4.04', 'Ratios in Right Triangles', 'Let’s investigate ratios in the side lengths of right triangles.'),
    (46, '4.05', 'Working with Ratios in Right Triangles', 'Let’s solve problems about right triangles.'),
    (47, '4.06', 'Working with Trigonometric Ratios', 'Let’s solve problems using cosine, sine, and tangent.'),
    (48, '4.07', 'Applying Ratios in Right Triangles', 'Let’s solve problems by using right triangles and trigonometry.'),
    (49, '4.08', 'Sine and Cosine in the Same Right Triangle', 'Let’s connect cosine and sine.'),
    (50, '4.09', 'Using Trigonometric Ratios to Find Angles', 'Let’s work backwards to find angles in right triangles.'),
    (51, '4.10', 'Solving Problems with Trigonometry', 'Let’s solve problems about right triangles.'),
    (52, '4.11', 'Approximating Pi', 'Let’s approximate the value of pi.'),
    (53, '5.01', 'Solids of Rotation', 'Let’s rotate two-dimensional shapes to make three-dimensional shapes.'),
    (54, '5.02', 'Slicing Solids', 'Let’s analyze cross sections by slicing three-dimensional solids.'),
    (55, '5.03', 'Creating Cross Sections by Dilating', 'Let’s create cross sections by doing dilations.'),
    (56, '5.04', 'Scaling and Area', 'Let’s see how the area of shapes changes when we dilate them.'),
    (57, '5.05', 'Scaling and Unscaling', 'Let’s examine the relationships between areas of dilated figures and scale factors.'),
    (58, '5.06', 'Scaling Solids', 'Let’s see how the surface area and volume of solids change when we dilate them.'),
    (59, '5.07', 'The Root of the Problem', 'Let’s look at relationships between volumes, areas, and scale factors using graphs and situations.'),
    (60, '5.08', 'Speaking of Scaling', 'Let’s practice moving back and forth between scale factors for lengths, surface areas, and volumes.'),
    (61, '5.09', 'Cylinder Volumes', 'Let’s analyze cylinder volumes.'),
    (62, '5.10', 'Cross Sections and Volume', 'Let’s look at how cross sections and volume are related.'),
    (63, '5.11', 'Prisms Practice', 'Let’s calculate volumes of prisms and cylinders.'),
    (64, '5.12', 'Prisms and Pyramids', 'Let’s describe relationships between pyramids and prisms.'),
    (65, '5.13', 'Building a Volume Formula for a Pyramid', 'Let’s create a formula for the volume of any pyramid or cone.'),
    (66, '5.14', 'Working with Pyramids', 'Let’s use the pyramid volume formula to solve problems.'),
    (67, '5.15', 'Putting All the Solids Together', 'Let’s calculate volumes of prisms, cylinders, cones, and pyramids.'),
    (68, '5.16', 'Surface Area and Volume', 'Let’s use volume and surface area to solve problems.'),
    (69, '5.17', 'Volume and Density', 'Let’s use volume and density to solve problems.'),
    (70, '5.18', 'Volume and Graphing', 'Let’s use volume and graphing to solve problems.'),
    (71, '6.01', 'Rigid Transformations in the Plane', 'Let’s try transformations with coordinates.'),
    (72, '6.02', 'Transformations as Functions', 'Let’s compare transformations to functions.'),
    (73, '6.03', 'Types of Transformations', 'Let’s analyze transformations that produce congruent and similar figures.'),
    (74, '6.04', 'Distances and Circles', 'Let’s build an equation for a circle.'),
    (75, '6.05', 'Squares and Circles', 'Let’s see how the distributive property can relate to equations of circles.'),
    (76, '6.06', 'Completing the Square', 'Let’s rewrite equations to find the center and radius of a circle.'),
    (77, '6.07', 'Distances and Parabolas', 'Let’s analyze the set of points that are the same distance from a given point and a given line.'),
    (78, '6.08', 'Equations and Graphs', 'Let’s write an equation for a parabola.'),
    (79, '6.09', 'Equations of Lines', 'Let’s investigate equations of lines.'),
    (80, '6.10', 'Parallel Lines in the Plane', 'Let’s investigate parallel lines in the coordinate plane.'),
    (81, '6.11', 'Perpendicular Lines in the Plane', 'Let’s analyze the slopes of perpendicular lines.'),
    (82, '6.12', 'It''s All on the Line', 'Let’s work with both parallel and perpendicular lines.'),
    (83, '6.13', 'Intersection Points', 'Let’s look at how circles and parabolas interact with lines.'),
    (84, '6.14', 'Coordinate Proof', 'Let’s use coordinates to prove theorems and to compute perimeter and area.'),
    (85, '6.15', 'Weighted Averages', 'Let’s split segments using averages and ratios.'),
    (86, '6.16', 'Weighted Averages in a Triangle', 'Let’s partition special line segments in triangles.'),
    (87, '6.17', 'Lines in Triangles', 'Let’s investigate more special segments in triangles.'),
    (88, '7.01', 'Lines, Angles, and Curves', 'Let’s define some line segments and angles related to circles.'),
    (89, '7.02', 'Inscribed Angles', 'Let’s analyze angles made from chords.'),
    (90, '7.03', 'Tangent Lines', 'Let’s explore lines that intersect a circle in exactly 1 point.'),
    (91, '7.04', 'Quadrilaterals in Circles', 'Let’s investigate quadrilaterals that fit in a circle.'),
    (92, '7.05', 'Triangles in Circles', 'Let’s see how perpendicular bisectors relate to circumscribed circles.'),
    (93, '7.06', 'A Special Point', 'Let’s see what we can learn about a triangle by watching how salt piles up on it.'),
    (94, '7.07', 'Circles in Triangles', 'Let’s construct the largest possible circle inside of a triangle.'),
    (95, '7.08', 'Arcs and Sectors', 'Let’s analyze portions of circles.'),
    (96, '7.09', 'Part to Whole', 'Let’s see what we can figure out about a circle if we’re given information about a sector of the circle.'),
    (97, '7.10', 'Angles, Arcs, and Radii', 'Let’s analyze relationships between arc lengths, radii, and central angles.'),
    (98, '7.11', 'A New Way to Measure Angles', 'Let’s look at a new way to measure angles.'),
    (99, '7.12', 'Radian Sense', 'Let’s get a sense for the sizes of angles measured in radians.'),
    (100, '7.13', 'Using Radians', 'Let’s see how radians can help us calculate sector areas and arc lengths.'),
    (101, '7.14', 'Putting It All Together', 'Let’s use geometry to solve problems.'),
    (102, '8.02', 'Playing with Probability', 'Let’s explore probability'),
    (103, '8.03', 'Sample Spaces', 'Let’s look closer at sample spaces.'),
    (104, '8.04', 'Tables of Relative Frequencies', 'Let’s use tables to organize probabilities.'),
    (105, '8.05', 'Combining Events', 'Let’s look at ways to describe events composed of other events.'),
    (106, '8.06', 'The Additioin Rule', 'Let’s learn about and use the addition rule.'),
    (107, '8.07', 'Related Events', 'Let’s see how events are related.'),
    (108, '8.08', 'Conditional Probability', 'Let’s examine conditional probability.'),
    (109, '8.09', 'Using Tables for Conditional Probability', 'Let’s use tables to estimate conditional probabilities.'),
    (110, '8.10', 'Using Probability to Determine Whether Events Are Independent', 'Let’s take a closer look at dependent and independent events.')
) as source(sequence_index, source_lesson_code, title, objective)
where provider.code = 'illustrative_math'
  and library.class_code = 'GEO'
on conflict (library_id, sequence_index) do update set
  source_lesson_code = excluded.source_lesson_code,
  title = excluded.title,
  objective = excluded.objective;

delete from public.curriculum_lessons lesson
using public.curriculum_libraries library, public.curriculum_providers provider
where lesson.library_id = library.id
  and library.provider_id = provider.id
  and provider.code = 'illustrative_math'
  and library.class_code = 'GEO'
  and lesson.sequence_index > 110;

-- Algebra II: 100 lessons from the supplied sequence.
insert into public.curriculum_lessons (library_id, sequence_index, source_lesson_code, title, objective)
select library.id, source.sequence_index, source.source_lesson_code, source.title, source.objective
from public.curriculum_libraries library
join public.curriculum_providers provider on provider.id = library.provider_id
cross join (values
    (1, '1.01', 'A Towering Sequence', 'Let’s explore the Tower of Hanoi.'),
    (2, '1.02', 'Introducing Geometric Sequences', 'Let’s explore growing and shrinking patterns.'),
    (3, '1.03', 'Different Types of Sequences', 'Let’s look at other types of sequences.'),
    (4, '1.05', 'Sequences are Functions', 'Let''s learn how to define a sequence recursively.'),
    (5, '1.07', 'Representing More Sequences', 'Let''s learn about Info Gaps'),
    (6, '1.08', 'The nth Term', 'Let’s see how to find terms of sequences directly.'),
    (7, '1.09', 'What''s the Equation?', 'Let’s define sequences.'),
    (8, '1.10', 'Situations and Sequence Types', 'Let’s decide what type of sequence we are looking at and how to represent it.'),
    (9, '1.11', 'Adding Up', 'Let’s look at sequences and the sum of their terms.'),
    (10, '2.01', 'Let''s Make a Box', 'Let’s investigate volumes of different boxes.'),
    (11, '2.02', 'Funding the Future', 'Let’s look at some other things that polynomials can model.'),
    (12, '2.03', 'Introducing Polynomials', 'Let’s see what polynomials can look like.'),
    (13, '2.04', 'Combining Polynomials', 'Let''s do arithmetic with polynomials.'),
    (14, '2.05', 'Connecting Factors and Zeros', 'Let’s investigate polynomials written in factored form.'),
    (15, '2.06', 'Different Forms', 'Let’s use the different forms of polynomials to learn about them.'),
    (16, '2.07', 'Using Factors and Zeros', 'Let’s write some polynomials.'),
    (17, '2.08', 'End Behavior', 'Let’s investigate the shape of polynomials.'),
    (18, '2.10', 'Multiplicity', 'Let’s sketch some polynomial functions.'),
    (19, '2.11', 'Finding Intersections', 'Let’s think about two polynomials at once.'),
    (20, '2.12', 'Polynomial Division', 'Let’s learn a way to divide polynomials.'),
    (21, '2.14', 'What Do You Know About Polynomials', 'Let''s put together what we''ve learned about polynomials so far.'),
    (22, '2.15', 'The Remainder Theorem', 'Let’s learn about the Remainder Theorem.'),
    (23, '2.16', 'Minimizing Surface Area', 'Let’s investigate surface areas of different cylinders.'),
    (24, '2.17', 'Graphs of Rational Functions', 'Let’s explore graphs and equations of rational functions.'),
    (25, '2.19', 'End Behavior of Rational Functions', 'Let’s explore the end behavior of rational functions.'),
    (26, '2.20', 'Rational Equations', 'Let’s write and solve some rational equations.'),
    (27, '2.22', 'Solving Rational Equations', 'Let’s think about how to solve rational equations strategically.'),
    (28, '2.23', 'Polynomial Identities', 'Let’s learn about polynomial identities.'),
    (29, '2.25', 'Summing Up', 'Let’s figure out a better way to add numbers.'),
    (30, '2.26', 'Using the Sum', 'Let’s calculate some totals.'),
    (31, '3.03', 'Exponents That Are Unit Fractions', 'Let’s explore exponents like 1/2 and 1/4.'),
    (32, '3.04', 'Positive Rational Exponents', 'Let’s use roots to write exponents that are fractions.'),
    (33, '3.05', 'Negative Rational Exponents', 'Let’s investigate negative exponents.'),
    (34, '3.06', 'Squares and Square Roots', 'Let’s compare equations with squares and square roots.'),
    (35, '3.07', 'Inequivalent Equations', 'Let’s see what happens when we square each side of an equation.'),
    (36, '3.08', 'Cubes and Cube Roots', 'Let’s compare equations with cubes and cube roots.'),
    (37, '3.10', 'A New Kind of Number', 'Let’s invent a new number.'),
    (38, '3.11', 'Introducing the Number i', 'Let’s meet i.'),
    (39, '3.12', 'Arithmetic with Complex Numbers', 'Let’s work with complex numbers.'),
    (40, '3.13', 'Multiplying Complex Numbers', 'Let''s multiply complex numbers.'),
    (41, '3.15', 'Working Backwards', 'Let''s use what we''ve learned about multiplying complex numbers.'),
    (42, '3.17', 'Completing the Square and Complex Solutions', 'Let’s find complex solutions to quadratic equations by completing the square.'),
    (43, '3.18', 'The Quadratic Formula and Complex Solutions', 'Let’s use the quadratic formula to find complex solutions to quadratic equations.'),
    (44, '4.01', 'Growing and Shrinking', 'Let’s calculate exponential change.'),
    (45, '4.03', 'Understanding Rational Inputs', 'Let’s look at exponential functions where the input values are not whole numbers.'),
    (46, '4.04', 'Representing Functions at Rational Inputs', 'Let’s find how quantities are growing or decaying over fractional intervals of time.'),
    (47, '4.05', 'Changes Over Rational Intervals', 'Let’s look at how an exponential function changes when the input changes by a fractional amount.'),
    (48, '4.06', 'Writing Equations and Exponential Functions', 'Let’s decide what information we need to write an equation for an exponential function.'),
    (49, '4.07', 'Interpreting and Using Exponential Functions', 'Let’s explore the ages of ancient things.'),
    (50, '4.08', 'Unknown Exponents', 'Let’s find unknown exponents.'),
    (51, '4.09', 'What is a Logarithm', 'Let’s learn about logarithms.'),
    (52, '4.10', 'Interpreting and Writing Logarithmic Equations', 'Let’s look at logarithms with different bases.'),
    (53, '4.11', 'Evaluating Logarithmic Expressions', 'Let’s find some logs.'),
    (54, '4.12', 'The Number e', 'Let’s learn about the number e.'),
    (55, '4.13', 'Exponential Functions with Base e', 'Let’s look at situations that can be modeled using exponential functions with base e.'),
    (56, '4.14', 'Solving Exponential Equations', 'Let’s solve equations using logarithms.'),
    (57, '4.15', 'Using Graphs and Logarithms to Sovle Problems', 'Let’s use graphs and logarithms to solve problems.'),
    (58, '4.17', 'Logarithmic Functions', 'Let’s graph log functions.'),
    (59, '5.01', 'Matching up to Data', 'Let’s describe how to transform graphs.'),
    (60, '5.02', 'Moving Functions', 'Let’s represent vertical and horizontal translations using function notation.'),
    (61, '5.03', 'More Movement', 'Let’s translate graphs vertically and horizontally to match situations.'),
    (62, '5.04', 'Reflecting Functions', 'Let’s reflect some graphs.'),
    (63, '5.05', 'Some Functions Have Symmetry', 'Let''s look at symmetry in graphs of functions'),
    (64, '5.06', 'Symmetry in Equations', 'Let’s use equations to decide if a function is even, odd, or neither.'),
    (65, '5.07', 'Expressing Transformations of Functions Algebraically', 'Let’s express transformed functions algebraically.'),
    (66, '5.08', 'Scaling the Outputs', 'Let’s stretch and squash some graphs.'),
    (67, '5.09', 'Scaling the Inputs', 'Let’s use scale factors in different ways.'),
    (68, '5.10', 'Combining Functions', 'Let’s make some new functions using other functions.'),
    (69, '5.11', 'Making a Model for Data', 'Let’s model with functions.'),
    (70, '6.01', 'Moving in Circles', 'Let’s think about moving in circles.'),
    (71, '6.02', 'Revisiting Right Triangles', 'Let’s recall and use some things we know about right triangles.'),
    (72, '6.03', 'The Unit Circle', 'Let’s learn about the unit circle.'),
    (73, '6.05', 'The Pythagorean Identity', 'Let’s learn more about cosine and sine.'),
    (74, '6.07', 'Finding Unknown Coordinates on a Circle', 'Let’s find coordinates on a circle.'),
    (75, '6.08', 'Rising and Falling', 'Let’s study graphs that repeat.'),
    (76, '6.09', 'Introduction to Trigonometric Functions', 'Let’s graph cosine and sine.'),
    (77, '6.10', 'Beyond 2π', 'Let’s go around a circle more than once.'),
    (78, '6.11', 'Extending the Domain of Trigonometric Functions', 'Let’s think about the value of cosine and sine for all types of inputs.'),
    (79, '6.12', 'Tangent', 'Let’s learn more about tangent.'),
    (80, '6.13', 'Amplitude and Midline', 'Let''s transform the graphs of trigonometric functions.'),
    (81, '6.14', 'Transforming Trigonometric Functions', 'Let’s make lots of changes to the graphs of trigonometric functions.'),
    (82, '6.15', 'Features of Trigonometric Graphs', 'Let’s compare graphs and equations of trigonometric functions.'),
    (83, '6.17', 'Comparing Transfomations', 'Let''s ask questions to figure out transformations of trigonometric functions.'),
    (84, '6.18', 'Modeling Circular Motion', 'Let''s use trigonometric functions to model circular motion.'),
    (85, '6.19', 'Beyond Circles', 'Let''s use trigonometric functions to model data.'),
    (86, '7.01', 'Being Skeptical', 'Let’s examine some ways people use statistics.'),
    (87, '7.02', 'Study Types', 'Let’s examine different kinds of studies.'),
    (88, '7.03', 'Randomness in Groups', 'Let’s explore why randomness is important in studies.'),
    (89, '7.05', 'Normal Distributions', 'Let’s investigate a specific type of distribution called a normal distribution.'),
    (90, '7.06', 'Area in Histograms', 'Let’s find proportions of data in certain intervals.'),
    (91, '7.07', 'Areas Under a Normal Curve', 'Let’s use the normal distribution to estimate the proportion of data values falling within given intervals.'),
    (92, '7.08', 'Not Always Ideal', 'Let’s see how closely data matches expectations.'),
    (93, '7.09', 'Variability in Samples', 'Let’s explore how samples can be different.'),
    (94, '7.10', 'Estimating Proportions from Samples', 'Let’s estimate population proportions with some data.'),
    (95, '7.11', 'Reducing Margin of Error', 'Let’s estimate population proportions and explore margin of error.'),
    (96, '7.12', 'Estimating a Population Mean', 'Let’s estimate population means using sample data.'),
    (97, '7.13', 'Expirimenting', 'Let’s do an experiment.'),
    (98, '7.14', 'Using Normal Distributions for Experiment Analysis', 'Let''s determine when the results from an experiment are significant.'),
    (99, '7.15', 'Questioning Experimenting', 'Let''s ask the right questions to analyze data from an experiment.'),
    (100, '7.16', 'Heart Rates', 'Let’s collect and analyze data.')
) as source(sequence_index, source_lesson_code, title, objective)
where provider.code = 'illustrative_math'
  and library.class_code = 'A2'
on conflict (library_id, sequence_index) do update set
  source_lesson_code = excluded.source_lesson_code,
  title = excluded.title,
  objective = excluded.objective;

delete from public.curriculum_lessons lesson
using public.curriculum_libraries library, public.curriculum_providers provider
where lesson.library_id = library.id
  and library.provider_id = provider.id
  and provider.code = 'illustrative_math'
  and library.class_code = 'A2'
  and lesson.sequence_index > 100;

commit;
