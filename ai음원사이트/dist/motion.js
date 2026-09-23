/* Entrance is tied to navigation, never to likes, lyrics or background refreshes. */
const AifectMotion = (() => {
  let previousRoute;
  return {
    enter(main, route) {
      main.classList.toggle('motion-enter', route !== previousRoute);
      previousRoute = route;
    }
  };
})();
